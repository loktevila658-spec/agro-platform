import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { Pool, PoolClient } from "pg";
import { fingerprint } from "../../../../../packages/connectors/src/index.cjs";
import { FarmService } from "../farm/farm.service";
import { MasterDataService } from "../master-data/master-data.service";
import { TasksService } from "../tasks/tasks.service";
import {
  SyncConflict,
  type SyncActor,
  type SyncCommand,
  type SyncChange,
} from "../sync/sync.types";
import { uuidv7 } from "../master-data/master-data.validation";
import { AGRONOMY_POOL, AgronomyService } from "./agronomy.service";
import { ActualOperationRegistry } from "./actual-operation.registry";
import {
  ACTUAL_COMMANDS,
  type ActualAction,
  type ActualRow,
  type ActualCapture,
} from "./actual-operation.types";
import { fail, id, object, string, timestamp } from "./agronomy.validation";
import {
  nextActualState,
  precision,
  validateCapture,
} from "./actual-operation.validation";
export function actualProjection(r: ActualRow): Record<string, unknown> {
  return {
    id: r.id,
    organizationId: r.organization_id,
    fieldSeasonId: r.field_season_id,
    version: Number(r.version),
    revisionId: r.revision_id,
    state: r.state,
    data: r.data,
    sourceReferences: r.source_refs,
    authorId: r.author_id,
    actorId: r.actor_id,
    recordedAt: new Date(r.recorded_at).toISOString(),
    ...(r.confirmed_revision_id
      ? { confirmedRevisionId: r.confirmed_revision_id }
      : {}),
  };
}
@Injectable()
export class ActualOperationService {
  constructor(
    @Inject(AGRONOMY_POOL) readonly pool: Pool,
    readonly registry: ActualOperationRegistry,
    private readonly farm: FarmService,
    private readonly master: MasterDataService,
    private readonly tasks: TasksService,
    private readonly planning: AgronomyService,
  ) {}
  async row(
    tx: Pool | PoolClient,
    a: SyncActor,
    key: string,
    lock = false,
  ): Promise<ActualRow | undefined> {
    id(key);
    return (
      await tx.query<ActualRow>(
        `SELECT f.*,r.id AS revision_id,r.state,r.data,r.source_refs,r.author_id,r.actor_id,r.provenance,r.recorded_at FROM agronomy.actual_fact f JOIN agronomy.actual_revision r ON r.tenant_id=f.tenant_id AND r.id=f.current_revision_id WHERE f.tenant_id=$1 AND f.id=$2${lock ? " FOR UPDATE OF f" : ""}`,
        [a.tenantId, key],
      )
    ).rows[0];
  }
  action(c: SyncCommand): ActualAction {
    const a = c.type.slice(16) as ActualAction;
    if (
      !ACTUAL_COMMANDS.includes(a) ||
      c.type !== `ActualOperation.${a}` ||
      c.commandVersion !== 1 ||
      c.aggregate.type !==
        (a === "Capture" ? "AgronomyCapture" : "ActualOperation")
    )
      fail("ACTUAL_COMMAND");
    id(c.aggregate.id);
    return a;
  }
  async authorize(
    tx: PoolClient,
    a: SyncActor,
    c: SyncCommand,
  ): Promise<boolean> {
    const action = this.action(c);
    if (action === "Capture") {
      const d = validateCapture(c.payload.data);
      return (
        c.aggregate.id === d.fieldSeasonId &&
        (await this.registry.scopes(a)).some(
          (s) =>
            s.fieldSeasonId === d.fieldSeasonId &&
            s.organizationId === d.organizationId,
        ) &&
        (await this.registry.can(
          a,
          "agronomy.operation.capture",
          d.organizationId,
        ))
      );
    }
    const r = await this.row(tx, a, c.aggregate.id);
    return (
      !!r &&
      (await this.registry.can(
        a,
        `agronomy.operation.${action.toLowerCase()}`,
        r.organization_id,
      ))
    );
  }
  async assertVersion(tx: PoolClient, a: SyncActor, c: SyncCommand) {
    if (this.action(c) === "Capture") return c.baseVersion === 0;
    const r = await this.row(tx, a, c.aggregate.id, true);
    return !!r && Number(r.version) === c.baseVersion;
  }
  async current(tx: PoolClient, a: SyncActor, c: SyncCommand) {
    if (this.action(c) === "Capture") return {};
    const r = await this.row(tx, a, c.aggregate.id);
    return r ? actualProjection(r) : {};
  }
  private async owner<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (e) {
      const m = e instanceof Error ? e.message : "";
      if (/^(FARM|MASTER_DATA)_/.test(m)) {
        if (m.includes("FORBIDDEN"))
          throw new ForbiddenException("ACTUAL_OWNER_FORBIDDEN");
        throw new BadRequestException("ACTUAL_OWNER_UNAVAILABLE");
      }
      throw e;
    }
  }
  private async resolve(tx: PoolClient, a: SyncActor, input: ActualCapture) {
    const actor = { tenantId: a.tenantId, subjectId: a.userId },
      d = structuredClone(input),
      refs: Record<string, unknown> = {};
    const f = await this.owner(() =>
      this.farm.taskReferenceInTransaction(
        tx,
        actor,
        d.fieldSeasonId,
        "FIELD_SEASON",
      ),
    );
    if (f.organization_id !== d.organizationId) fail("ACTUAL_SCOPE");
    refs.fieldSeason = f;
    if (d.taskId) {
      const source = await this.tasks.actualReferenceInTransaction(
        tx,
        a,
        d.taskId,
      );
      if (
        source.organizationId !== d.organizationId ||
        source.fieldSeasonId !== d.fieldSeasonId
      )
        fail("ACTUAL_TASK_CONTEXT");
      Object.assign(d, {
        operationTypeId: source.operationTypeId,
        startedAt: source.startedAt,
        completedAt: source.completedAt,
        actualQuantity: source.actualQuantity,
        unit: source.unit,
        executors: source.executors,
      });
      refs.task = source;
    }
    if (
      !timestamp(d.startedAt) ||
      !timestamp(d.completedAt) ||
      Date.parse(d.completedAt) < Date.parse(d.startedAt) ||
      Date.parse(d.completedAt) >
        Date.now() + this.registry.rules().maxFutureSkewMs
    )
      fail("ACTUAL_TIME");
    refs.operation = await this.registry.reference(
      tx,
      a,
      "OPERATION",
      d.operationTypeId!,
      d.organizationId,
    );
    const unit = await this.owner(() =>
      this.master.planningReferenceInTransaction(
        tx,
        actor,
        "UnitOfMeasure",
        d.unit!,
        d.organizationId,
      ),
    );
    precision(d.actualQuantity!, Number(unit.precision));
    refs.unit = unit;
    if (d.plannedOperation) {
      const p = await this.planning.actualPlannedReferenceInTransaction(
        tx,
        actor,
        d.organizationId,
        d.plannedOperation,
      );
      if (
        p.fieldSeasonId !== d.fieldSeasonId ||
        p.operationTypeId !== d.operationTypeId ||
        p.unit !== d.unit
      )
        fail("ACTUAL_PLAN_CONTEXT");
      refs.plannedOperation = p;
    }
    const executors = [];
    for (const uid of d.executors!)
      executors.push(
        await this.registry.reference(tx, a, "EMPLOYEE", uid, d.organizationId),
      );
    refs.executors = executors;
    const materials = [];
    for (const r of d.materials) {
      const material = await this.owner(() =>
          this.master.planningReferenceInTransaction(
            tx,
            actor,
            "Material",
            r.materialId,
            d.organizationId,
          ),
        ),
        u = await this.owner(() =>
          this.master.planningReferenceInTransaction(
            tx,
            actor,
            "UnitOfMeasure",
            r.unit,
            d.organizationId,
          ),
        );
      if (material.baseUom !== r.unit)
        fail("ACTUAL_UNIT_CONVERSION_UNAVAILABLE");
      precision(r.quantity, Number(u.precision));
      materials.push({ material, unit: u });
    }
    refs.materials = materials;
    const labor = [];
    for (const r of d.labor) {
      const employee = await this.registry.reference(
          tx,
          a,
          "EMPLOYEE",
          r.employeeId,
          d.organizationId,
        ),
        u = await this.owner(() =>
          this.master.planningReferenceInTransaction(
            tx,
            actor,
            "UnitOfMeasure",
            r.unit,
            d.organizationId,
          ),
        );
      precision(r.quantity, Number(u.precision));
      if (
        d.taskId &&
        !(
          (refs.task as Record<string, unknown>).employeeIds as string[]
        ).includes(r.employeeId)
      )
        fail("ACTUAL_LABOR_NOT_ASSIGNED");
      labor.push({ employee, unit: u });
    }
    refs.labor = labor;
    await this.registry.validate(tx, a, d, refs);
    return { data: d, refs };
  }
  async apply(
    tx: PoolClient,
    a: SyncActor,
    c: SyncCommand,
  ): Promise<{
    canonical: Record<string, unknown>;
    aggregateVersion: number;
    changes: SyncChange[];
  }> {
    if (process.env.AGRO_DEPLOYMENT_MODE !== "LOCAL_PRIMARY")
      throw new ForbiddenException("LOCAL_PRIMARY_REQUIRED");
    const action = this.action(c);
    object(c.payload, [
      "reason",
      ...(action === "Capture" || action === "Correct" ? ["data"] : []),
    ]);
    string(c.payload.reason);
    if (!timestamp(c.observedAt)) fail("ACTUAL_OBSERVED_AT");
    if (action !== "Capture" && c.offlineAuthId !== "online")
      throw new ForbiddenException("ACTUAL_REVIEW_ONLINE_ONLY");
    const before =
      action === "Capture"
        ? undefined
        : await this.row(tx, a, c.aggregate.id, true);
    if (!(await this.authorize(tx, a, c)))
      throw new ForbiddenException("ACTUAL_FORBIDDEN");
    if (!(await this.assertVersion(tx, a, c)))
      throw new SyncConflict(
        "VERSION_CONFLICT",
        before ? actualProjection(before) : {},
      );
    const state =
      action === "Capture"
        ? "CAPTURED"
        : nextActualState(before!.state, action);
    let data: ActualCapture,
      refs: Record<string, unknown>,
      captureInput: ActualCapture;
    if (action === "Capture" || action === "Correct") {
      captureInput = validateCapture(c.payload.data);
      if (
        before &&
        (captureInput.organizationId !== before.organization_id ||
          captureInput.fieldSeasonId !== before.field_season_id ||
          captureInput.taskId !== before.data.taskId)
      )
        fail("ACTUAL_CORRECTION_IDENTITY");
      const r = await this.resolve(tx, a, captureInput);
      data = r.data;
      refs = r.refs;
    } else {
      captureInput = before!.provenance.captureInput as ActualCapture;
      data = before!.data;
      refs = before!.source_refs;
      if (action === "Confirm") {
        if (
          this.registry.rules().requireIndependentConfirmation &&
          before!.author_id === a.userId
        )
          throw new ForbiddenException("ACTUAL_INDEPENDENT_REVIEW_REQUIRED");
        const current = await this.resolve(tx, a, captureInput);
        if (
          fingerprint(current.refs) !== fingerprint(refs) ||
          fingerprint(current.data) !== fingerprint(data)
        )
          throw new SyncConflict("VERSION_CONFLICT", actualProjection(before!));
      }
    }
    const key = before?.id ?? c.localCommandId,
      rid = uuidv7(),
      v = before ? (BigInt(before.version) + 1n).toString() : "1",
      confirmed =
        action === "Confirm" ? rid : (before?.confirmed_revision_id ?? null),
      author =
        action === "Capture" || action === "Correct"
          ? a.userId
          : before!.author_id,
      correlation =
        typeof c.provenance.correlationId === "string"
          ? c.provenance.correlationId
          : c.localCommandId;
    string(correlation, 128);
    const provenance = {
      captureInput,
      deviceId: a.deviceId,
      sessionId: a.sessionId,
      offlineAuthId: c.offlineAuthId,
      observedAt: c.observedAt,
      intent: c.provenance,
      attachments: c.attachments,
    };
    const completion =
      (refs.task as { completionId: string } | undefined)?.completionId ?? null;
    try {
      if (before)
        await tx.query(
          "UPDATE agronomy.actual_fact SET version=$3,current_revision_id=$4,confirmed_revision_id=$5 WHERE tenant_id=$1 AND id=$2",
          [a.tenantId, key, v, rid, confirmed],
        );
      else
        await tx.query(
          "INSERT INTO agronomy.actual_fact(tenant_id,id,organization_id,field_season_id,task_completion_id,version,current_revision_id) VALUES($1,$2,$3,$4,$5,$6,$7)",
          [
            a.tenantId,
            key,
            data.organizationId,
            data.fieldSeasonId,
            completion,
            v,
            rid,
          ],
        );
    } catch (e) {
      if ((e as { code?: string }).code === "23505")
        throw new ConflictException("ACTUAL_SOURCE_ALREADY_CAPTURED");
      throw e;
    }
    const result = await tx.query(
      "INSERT INTO agronomy.actual_revision(tenant_id,fact_id,id,version,previous_revision_id,state,data,source_refs,provenance,author_id,actor_id,reason,command_id,correlation_id,causation_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$13::text) RETURNING recorded_at",
      [
        a.tenantId,
        key,
        rid,
        v,
        before?.revision_id ?? null,
        state,
        data,
        refs,
        provenance,
        author,
        a.userId,
        c.payload.reason,
        c.localCommandId,
        correlation,
      ],
    );
    const row: ActualRow = {
        tenant_id: a.tenantId,
        id: key,
        organization_id: data.organizationId,
        field_season_id: data.fieldSeasonId,
        task_completion_id: completion,
        version: v,
        revision_id: rid,
        confirmed_revision_id: confirmed,
        state,
        data,
        source_refs: refs,
        provenance,
        author_id: author,
        actor_id: a.userId,
        recorded_at: result.rows[0].recorded_at,
      },
      canonical = actualProjection(row);
    await tx.query(
      "INSERT INTO agronomy.actual_audit(id,tenant_id,fact_id,revision_id,action,actor_id,before_value,after_value,reason,command_id,correlation_id,causation_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$10::text)",
      [
        randomUUID(),
        a.tenantId,
        key,
        rid,
        action,
        a.userId,
        before ? actualProjection(before) : null,
        canonical,
        c.payload.reason,
        c.localCommandId,
        correlation,
      ],
    );
    const eventId = randomUUID(),
      occurredAt = new Date().toISOString(),
      suffix = {
        Capture: "captured",
        Submit: "submitted",
        Confirm: "confirmed",
        Reject: "rejected",
        Correct: "corrected",
      }[action],
      payload = {
        eventId,
        entityId: key,
        revisionId: rid,
        revision: v,
        tenantId: a.tenantId,
        actorId: a.userId,
        correlationId: correlation,
        causationId: c.localCommandId,
        occurredAt,
      };
    await tx.query(
      "INSERT INTO agronomy.actual_outbox_event(id,tenant_id,event_name,event_version,producer,entity_id,actor_id,correlation_id,causation_id,occurred_at,payload) VALUES($1,$2,$3,'1.0.0','agronomy-actual',$4,$5,$6,$7,$8,$9)",
      [
        eventId,
        a.tenantId,
        `agronomy.operation.${suffix}`,
        key,
        a.userId,
        correlation,
        c.localCommandId,
        occurredAt,
        payload,
      ],
    );
    return {
      canonical,
      aggregateVersion: Number(v),
      changes: [
        {
          entityType: "ActualOperation",
          entityId: key,
          entityVersion: Number(v),
          op: "UPSERT",
          projection: canonical,
          visibleUserIds: [...new Set([a.userId, author, ...data.executors!])],
        },
      ],
    };
  }
  async read(a: SyncActor, key: string) {
    const r = await this.row(this.pool, a, key);
    if (
      !r ||
      !(await this.registry.can(
        a,
        "agronomy.operation.view",
        r.organization_id,
      ))
    )
      throw new NotFoundException("ACTUAL_NOT_AVAILABLE");
    return actualProjection(r);
  }
  async list(a: SyncActor, org: string, after?: string) {
    id(org);
    if (after !== undefined) id(after);
    await this.registry.authorize(a, "agronomy.operation.view", org);
    const r = await this.pool.query(
      "SELECT id FROM agronomy.actual_fact WHERE tenant_id=$1 AND organization_id=$2 AND ($3::uuid IS NULL OR id>$3) ORDER BY id LIMIT 100",
      [a.tenantId, org, after ?? null],
    );
    return Promise.all(r.rows.map((r) => this.read(a, r.id)));
  }
  async history(a: SyncActor, key: string) {
    await this.read(a, key);
    return (
      await this.pool.query(
        'SELECT id AS "revisionId",version,state,previous_revision_id AS "previousRevisionId",data,source_refs AS "sourceReferences",provenance,author_id AS "authorId",actor_id AS "actorId",reason,recorded_at AS "recordedAt" FROM agronomy.actual_revision WHERE tenant_id=$1 AND fact_id=$2 ORDER BY version',
        [a.tenantId, key],
      )
    ).rows.map((r) => {
      if (r.previousRevisionId === null) delete r.previousRevisionId;
      return r;
    });
  }
  async contexts(a: SyncActor) {
    const tx = await this.pool.connect();
    try {
      await tx.query("BEGIN");
      const result = [];
      for (const s of await this.registry.scopes(a)) {
        if (
          !(await this.registry.can(
            a,
            "agronomy.operation.capture",
            s.organizationId,
          ))
        )
          continue;
        const r = await this.owner(() =>
          this.farm.taskReferenceInTransaction(
            tx,
            { tenantId: a.tenantId, subjectId: a.userId },
            s.fieldSeasonId,
            "FIELD_SEASON",
          ),
        );
        if (r.organization_id !== s.organizationId) fail("ACTUAL_SCOPE");
        result.push({ ...s, revisionId: r.revisionId });
      }
      await tx.query("COMMIT");
      return result;
    } catch (e) {
      await tx.query("ROLLBACK").catch(() => undefined);
      throw e;
    } finally {
      tx.release();
    }
  }
}
