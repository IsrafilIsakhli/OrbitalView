use axum::{
    Json,
    http::{HeaderValue, StatusCode, header::RETRY_AFTER},
    response::{IntoResponse, Response},
};
use serde::Serialize;

#[derive(Debug)]
pub struct GatewayError {
    pub code: &'static str,
    pub message: String,
    pub retry_after_ms: Option<u64>,
    pub status: StatusCode,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ErrorPayload<'a> {
    code: &'a str,
    message: &'a str,
    retry_after_ms: Option<u64>,
}

impl GatewayError {
    pub fn bad_request(code: &'static str, message: impl Into<String>) -> Self {
        Self {
            code,
            message: message.into(),
            retry_after_ms: None,
            status: StatusCode::BAD_REQUEST,
        }
    }

    pub fn upstream(
        code: &'static str,
        message: impl Into<String>,
        retry_after_ms: Option<u64>,
    ) -> Self {
        Self {
            code,
            message: message.into(),
            retry_after_ms,
            status: StatusCode::BAD_GATEWAY,
        }
    }

    pub fn rate_limited(retry_after_ms: u64) -> Self {
        Self {
            code: "gateway_rate_limited",
            message: "Translation request rate limit exceeded".to_owned(),
            retry_after_ms: Some(retry_after_ms),
            status: StatusCode::TOO_MANY_REQUESTS,
        }
    }
}

impl IntoResponse for GatewayError {
    fn into_response(self) -> Response {
        let payload = ErrorPayload {
            code: self.code,
            message: &self.message,
            retry_after_ms: self.retry_after_ms,
        };
        let mut response = (self.status, Json(payload)).into_response();
        if let Some(retry_after_ms) = self.retry_after_ms {
            let seconds = retry_after_ms.div_ceil(1_000).max(1).to_string();
            if let Ok(value) = HeaderValue::from_str(&seconds) {
                response.headers_mut().insert(RETRY_AFTER, value);
            }
        }
        response
    }
}
