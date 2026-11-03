/**
 * Normalize the two status layers returned by the Midtrans Get Status API.
 * A payment may only be treated as not found on an explicit HTTP/API 404.
 * Any ambiguous or unsuccessful response fails closed.
 *
 * @param {number} httpStatus
 * @param {unknown} body
 * @returns {{ kind: "not_found" } | { kind: "found", transactionStatus: string }}
 */
export function parseMidtransStatusResponse(httpStatus, body) {
  if (httpStatus === 404) {
    return { kind: "not_found" };
  }

  if (!Number.isInteger(httpStatus) || httpStatus < 200 || httpStatus >= 300) {
    throw new Error(`Pemeriksaan status Midtrans gagal (HTTP ${httpStatus}). Tagihan tidak diubah.`);
  }

  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    throw new Error(`Respons status Midtrans tidak valid (HTTP ${httpStatus}). Tagihan tidak diubah.`);
  }

  const responseBody = /** @type {Record<string, unknown>} */ (body);
  const statusCodeValue = responseBody.status_code;
  const apiStatusCode = statusCodeValue === undefined || statusCodeValue === null
    ? null
    : String(statusCodeValue).trim();

  if (apiStatusCode === "404") {
    return { kind: "not_found" };
  }

  // Midtrans uses 201 for a valid pending transaction response as well.
  if (apiStatusCode !== null && !["200", "201"].includes(apiStatusCode)) {
    throw new Error(
      `Pemeriksaan status Midtrans gagal (HTTP ${httpStatus}, API ${apiStatusCode}). Tagihan tidak diubah.`,
    );
  }

  const transactionStatus = responseBody.transaction_status;
  if (typeof transactionStatus !== "string" || transactionStatus.trim().length === 0) {
    throw new Error(
      `Respons status Midtrans tidak berisi transaction_status (HTTP ${httpStatus}, API ${apiStatusCode ?? "tidak tersedia"}). Tagihan tidak diubah.`,
    );
  }

  return { kind: "found", transactionStatus: transactionStatus.trim() };
}
