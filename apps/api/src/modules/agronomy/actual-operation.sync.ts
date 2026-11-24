import { Injectable, OnModuleInit } from "@nestjs/common";
import { SyncRegistry } from "../sync/sync.registry";
import { ActualOperationService } from "./actual-operation.service";
import { ACTUAL_COMMANDS } from "./actual-operation.types";
@Injectable()
export class ActualOperationSync implements OnModuleInit {
  constructor(
    private readonly registry: SyncRegistry,
    private readonly service: ActualOperationService,
  ) {}
  onModuleInit() {
    const s = this.service;
    this.registry.registerProjectionPolicy("ActualOperation", async (a, id) => {
      try {
        await s.read(a, id);
        return true;
      } catch {
        return false;
      }
    });
    this.registry.registerProjectionPolicy("AgronomyCapture", async (a, id) =>
      (await s.contexts(a)).some((r) => r.fieldSeasonId === id),
    );
    this.registry.registerFilePolicy("AgronomyCapture", async (req) => {
      try {
        return (
          await s.contexts({
            tenantId: req.tenantId,
            userId: req.actorId,
            deviceId: "",
            sessionId: "",
          })
        ).some((r) => r.fieldSeasonId === req.ownerRef.slice(16));
      } catch {
        return false;
      }
    });
    this.registry.registerFilePolicy("ActualOperation", async (req) => {
      try {
        await s.read(
          {
            tenantId: req.tenantId,
            userId: req.actorId,
            deviceId: "",
            sessionId: "",
          },
          req.ownerRef.slice(16),
        );
        return req.action === "file.read";
      } catch {
        return false;
      }
    });
    for (const action of ACTUAL_COMMANDS)
      this.registry.register({
        commandType: `ActualOperation.${action}`,
        version: 1,
        requiresVersion: true,
        authorize: (tx, a, c) => s.authorize(tx, a, c),
        assertVersion: (tx, a, c) => s.assertVersion(tx, a, c),
        currentState: (tx, a, c) => s.current(tx, a, c),
        execute: (tx, a, c) => s.apply(tx, a, c),
        offlinePolicy: async (a) => {
          if (action !== "Capture") return undefined;
          try {
            const ttl = s.registry.rules().offlineTtlSeconds,
              contexts = await s.contexts(a);
            return ttl && contexts.length
              ? {
                  owners: contexts.map(
                    (r) => `AgronomyCapture:${r.fieldSeasonId}`,
                  ),
                  risk: "O1",
                  ttlSeconds: ttl,
                }
              : undefined;
          } catch {
            return undefined;
          }
        },
      });
  }
}
