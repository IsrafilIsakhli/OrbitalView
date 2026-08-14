import type { DataProvenance } from "./freshness";

export interface DataEnvelope<T> {
  data: T;
  provenance: DataProvenance;
  rejectedRecordCount: number;
}
