use std::{
    collections::HashMap,
    time::{Duration, Instant},
};

use tokio::sync::Mutex;

pub struct RateLimiter {
    limit: usize,
    clients: Mutex<HashMap<String, Window>>,
}

struct Window {
    count: usize,
    started: Instant,
}

impl RateLimiter {
    pub fn new(limit: usize) -> Self {
        Self {
            limit,
            clients: Mutex::new(HashMap::new()),
        }
    }

    pub async fn check(&self, client_key: String) -> Result<(), u64> {
        let mut clients = self.clients.lock().await;
        let now = Instant::now();
        clients.retain(|_, window| now.duration_since(window.started) < Duration::from_secs(120));
        let window = clients.entry(client_key).or_insert(Window {
            count: 0,
            started: now,
        });
        if now.duration_since(window.started) >= Duration::from_secs(60) {
            *window = Window {
                count: 0,
                started: now,
            };
        }
        if window.count >= self.limit {
            return Err(Duration::from_secs(60)
                .saturating_sub(now.duration_since(window.started))
                .as_millis() as u64);
        }
        window.count += 1;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::RateLimiter;

    #[tokio::test]
    async fn rejects_requests_past_the_window_budget() {
        let limiter = RateLimiter::new(1);
        assert!(
            limiter
                .check("127.0.0.1:install-a".to_owned())
                .await
                .is_ok()
        );
        assert!(
            limiter
                .check("127.0.0.1:install-a".to_owned())
                .await
                .is_err()
        );
        assert!(
            limiter
                .check("127.0.0.1:install-b".to_owned())
                .await
                .is_ok()
        );
    }
}
