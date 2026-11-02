const { redactSensitive } = require("./system");

function errorMessage(error) {
  if (typeof error === "string") return error;
  return error?.message || "Error inesperado";
}

function apiError(res, status, code, error, details = undefined) {
  const payload = {
    error: redactSensitive(errorMessage(error)),
    code
  };
  if (details !== undefined) payload.details = redactSensitive(details);
  return res.status(status).json(payload);
}

function notFound(res, message = "Entidad no encontrada", code = "NOT_FOUND") {
  return apiError(res, 404, code, message);
}

function badRequest(res, error, code = "BAD_REQUEST", details = undefined) {
  return apiError(res, 400, code, error, details);
}

module.exports = {
  apiError,
  badRequest,
  notFound
};
