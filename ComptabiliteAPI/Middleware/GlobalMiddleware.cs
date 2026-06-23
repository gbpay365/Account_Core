using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Logging;
using System.Net;
using System.Text.Json;

namespace ComptabiliteAPI.Middleware
{
    /// <summary>
    /// Catches all unhandled exceptions and returns a clean JSON error response.
    /// Phase 6 requirement: global error handling middleware.
    /// </summary>
    public class GlobalExceptionMiddleware
    {
        private readonly RequestDelegate _next;
        private readonly ILogger<GlobalExceptionMiddleware> _logger;

        public GlobalExceptionMiddleware(RequestDelegate next, ILogger<GlobalExceptionMiddleware> logger)
        {
            _next = next;
            _logger = logger;
        }

        public async Task InvokeAsync(HttpContext context)
        {
            try
            {
                await _next(context);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Unhandled exception: {Message}", ex.Message);
                await HandleExceptionAsync(context, ex);
            }
        }

        private static Task HandleExceptionAsync(HttpContext context, Exception exception)
        {
            // SECURITY FIX: Don't leak internal error details to clients
            // Map specific exceptions to user-friendly messages, but not raw exception.Message
            
            context.Response.ContentType = "application/json";
            
            (string message, int statusCode) = exception switch
            {
                UnauthorizedAccessException => ("Authentication required", (int)HttpStatusCode.Unauthorized),
                ArgumentException => ("Invalid request parameters", (int)HttpStatusCode.BadRequest),
                InvalidOperationException => ("Operation not permitted", (int)HttpStatusCode.BadRequest),
                KeyNotFoundException => ("Resource not found", (int)HttpStatusCode.NotFound),
                _ => ("An internal error occurred. Please contact support if this persists.", (int)HttpStatusCode.InternalServerError)
            };

            context.Response.StatusCode = statusCode;

            var result = JsonSerializer.Serialize(new
            {
                error = message,
                statusCode = statusCode,
                requestId = context.TraceIdentifier,
                timestamp = DateTime.UtcNow
            });

            return context.Response.WriteAsync(result);
        }
    }

    /// <summary>
    /// Logs every API request for OHADA audit compliance.
    /// Phase 6 requirement: audit logging middleware.
    /// </summary>
    public class AuditLogMiddleware
    {
        private readonly RequestDelegate _next;
        private readonly ILogger<AuditLogMiddleware> _logger;

        public AuditLogMiddleware(RequestDelegate next, ILogger<AuditLogMiddleware> logger)
        {
            _next = next;
            _logger = logger;
        }

        public async Task InvokeAsync(HttpContext context)
        {
            var start = DateTime.UtcNow;
            await _next(context);
            var elapsed = (DateTime.UtcNow - start).TotalMilliseconds;

            _logger.LogInformation(
                "[AUDIT] {Method} {Path} → {StatusCode} ({Elapsed}ms) | IP: {IP} | User: {User}",
                context.Request.Method,
                context.Request.Path,
                context.Response.StatusCode,
                elapsed,
                context.Connection.RemoteIpAddress,
                context.User?.Identity?.Name ?? "anonymous"
            );
        }
    }
}
