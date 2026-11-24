import { ConflictException } from "@nestjs/common";
import {
  decimal,
  fail,
  id,
  object,
  string,
  timestamp,
} from "./agronomy.validation";
import type { ActualCapture, ActualState } from "./actual-operation.types";
export function validateCapture(v: unknown): ActualCapture {
  object(v, [
    "organizationId",
    "fieldSeasonId",
    "taskId",
    "operationTypeId",
    "startedAt",
    "completedAt",
    "actualQuantity",
    "unit",
    "executors",
    "materials",
    "labor",
    "sourceType",
    "comment",
    "plannedOperation",
    "location",
  ]);
  id(v.organizationId);
  id(v.fieldSeasonId);
  if (!["USER_WEB", "USER_MOBILE", "API"].includes(v.sourceType as string))
    fail("ACTUAL_SOURCE");
  if (v.taskId !== undefined) {
    id(v.taskId);
    if (
      [
        "operationTypeId",
        "startedAt",
        "completedAt",
        "actualQuantity",
        "unit",
        "executors",
      ].some((k) => v[k] !== undefined)
    )
      fail("ACTUAL_TASK_REENTRY");
  } else {
    id(v.operationTypeId);
    decimal(v.actualQuantity);
    string(v.unit, 16);
    if (
      !timestamp(v.startedAt) ||
      !timestamp(v.completedAt) ||
      Date.parse(v.completedAt) < Date.parse(v.startedAt)
    )
      fail("ACTUAL_INTERVAL");
    if (
      !Array.isArray(v.executors) ||
      !v.executors.length ||
      v.executors.length > 100
    )
      fail("ACTUAL_EXECUTORS");
    v.executors.forEach(id);
    if (new Set(v.executors).size !== v.executors.length)
      fail("ACTUAL_DUPLICATE");
  }
  for (const name of ["materials", "labor"]) {
    const values = v[name];
    if (!Array.isArray(values) || values.length > 100) fail("ACTUAL_RESOURCES");
    const key = name === "materials" ? "materialId" : "employeeId";
    for (const r of values) {
      object(r, [key, "quantity", "unit"]);
      id(r[key]);
      decimal(r.quantity);
      string(r.unit, 16);
    }
    if (new Set(values.map((r) => r[key])).size !== values.length)
      fail("ACTUAL_DUPLICATE");
  }
  if (v.comment !== undefined) string(v.comment, 2000);
  if (v.plannedOperation !== undefined) {
    object(v.plannedOperation, ["mapId", "revisionId", "operationId"]);
    Object.values(v.plannedOperation).forEach(id);
    id(v.plannedOperation.mapId);
    id(v.plannedOperation.revisionId);
    id(v.plannedOperation.operationId);
  }
  if (v.location !== undefined) {
    const l = v.location;
    object(l, ["latitude", "longitude", "accuracyMetres", "observedAt"]);
    if (
      typeof l.latitude !== "number" ||
      !Number.isFinite(l.latitude) ||
      Math.abs(l.latitude) > 90 ||
      typeof l.longitude !== "number" ||
      !Number.isFinite(l.longitude) ||
      Math.abs(l.longitude) > 180 ||
      typeof l.accuracyMetres !== "number" ||
      !Number.isFinite(l.accuracyMetres) ||
      l.accuracyMetres < 0 ||
      !timestamp(l.observedAt)
    )
      fail("ACTUAL_LOCATION");
  }
  return structuredClone(v) as unknown as ActualCapture;
}
export function precision(v: string, p: number): void {
  decimal(v);
  if (
    !Number.isInteger(p) ||
    p < 0 ||
    p > 6 ||
    (v.split(".")[1]?.replace(/0+$/, "").length ?? 0) > p
  )
    fail("ACTUAL_PRECISION");
}
export function nextActualState(s: ActualState, a: string): ActualState {
  if (["CAPTURED", "CORRECTED_VERSION"].includes(s) && a === "Submit")
    return "PENDING_CONFIRMATION";
  if (s === "PENDING_CONFIRMATION" && a === "Confirm") return "CONFIRMED";
  if (s === "PENDING_CONFIRMATION" && a === "Reject") return "REJECTED";
  if (["CONFIRMED", "REJECTED"].includes(s) && a === "Correct")
    return "CORRECTED_VERSION";
  throw new ConflictException("ACTUAL_STATE_CONFLICT");
}
