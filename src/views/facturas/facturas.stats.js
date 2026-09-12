/* The same domain projection feeds Home and Facturas. It never reads a list,
   requests data, or substitutes loaded-row aggregates for absent totals. */
import { declaredMetric, exactTotal } from "../../core/statistics.js";

const fields = {
  totalImporte: ["totalAmount", "grossAmount", "totalFacturado", "totalImporte", "invoiceAmount", "amount"],
  totalPagado: ["paidAmount", "paidTotal", "totalPagado", "totalPaid", "importePagado", "amountPaid"],
  totalVencido: ["overdueAmount", "overdueTotal", "totalVencido"],
  pendingAmount: ["pendingAmount", "pendingTotal", "totalPendiente"],
};
const counts = {
  pendingCount: ["pendingCount", "countPendientes"],
  paidCount: ["paidCount", "countPagadas"],
  overdueCount: ["overdueCount", "countVencidas"],
  pdfCount: ["countWithPdf", "countConPdf"],
  sentCount: ["sentCount", "countEnviadas"],
  incidenciaCount: ["linkedTicketCount", "countConIncidencia"],
};

export function selectFacturasStats(input = {}) {
  const source = input && input.ok !== false && input.success !== false && input.error !== true ? input : {};
  const result = { total: exactTotal(source, ["invoiceCount", "countTotal", "totalCount", "count", "total"]) };
  for (const [name, aliases] of Object.entries(fields)) result[name] = declaredMetric(source, aliases);
  for (const [name, aliases] of Object.entries(counts)) result[name] = exactTotal(source, aliases);
  result.totalPendiente = declaredMetric(source, ["outstandingAmount", "outstandingTotal"]);
  if (!Object.hasOwn(source, "outstandingAmount") && !Object.hasOwn(source, "outstandingTotal") && result.pendingAmount !== null && result.totalVencido !== null) {
    result.totalPendiente = result.pendingAmount + result.totalVencido;
  }
  return result;
}
