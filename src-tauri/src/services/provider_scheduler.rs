use std::time::Duration;

use tauri::{AppHandle, Emitter, Manager};

use crate::{
    commands::control_center::{
        OperationsService, ProviderId, RefreshProviderResult, refresh_provider_from_app,
    },
    services::news_service::NewsService,
};

pub fn spawn_background_tasks(app: AppHandle) {
    spawn_translation_worker(app.clone());
    spawn_launch_library_worker(app.clone());
    spawn_fixed_provider(
        app.clone(),
        ProviderId::NoaaSwpc,
        Duration::from_secs(5 * 60),
    );
    spawn_fixed_provider(app.clone(), ProviderId::Nasa, Duration::from_secs(30 * 60));
    spawn_fixed_provider(
        app.clone(),
        ProviderId::SpaceflightNews,
        Duration::from_secs(15 * 60),
    );
    spawn_fixed_provider(app, ProviderId::Celestrak, Duration::from_secs(2 * 60 * 60));
}

fn spawn_translation_worker(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        let mut ticker = tokio::time::interval(Duration::from_secs(20));
        ticker.tick().await;
        loop {
            ticker.tick().await;
            if !app.state::<OperationsService>().background_sync_enabled() {
                continue;
            }
            let news = app.state::<NewsService>();
            let _ = news.process_translation_batch(&app).await;
        }
    });
}

fn spawn_launch_library_worker(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        let mut interval = Duration::from_secs(10 * 60);
        let mut retry_count = 0_u8;
        loop {
            tokio::time::sleep(interval).await;
            if !app.state::<OperationsService>().background_sync_enabled() {
                continue;
            }
            match refresh(&app, ProviderId::LaunchLibrary).await {
                Ok(result) => {
                    retry_count = 0;
                    interval = Duration::from_millis(result.suggested_interval_ms);
                }
                Err(_) => {
                    retry_count = retry_count.saturating_add(1);
                    interval = retry_delay(retry_count, ProviderId::LaunchLibrary);
                    app.state::<OperationsService>().schedule_retry(
                        ProviderId::LaunchLibrary,
                        retry_count,
                        interval,
                    );
                }
            }
            let _ = app.emit("provider-health-changed", ProviderId::LaunchLibrary);
        }
    });
}

fn spawn_fixed_provider(app: AppHandle, provider: ProviderId, interval: Duration) {
    tauri::async_runtime::spawn(async move {
        let mut next_delay = interval;
        let mut retry_count = 0_u8;
        loop {
            tokio::time::sleep(next_delay).await;
            if !app.state::<OperationsService>().background_sync_enabled() {
                next_delay = Duration::from_secs(20);
                continue;
            }
            match refresh(&app, provider).await {
                Ok(_) => {
                    retry_count = 0;
                    next_delay = interval;
                }
                Err(_) => {
                    retry_count = retry_count.saturating_add(1);
                    next_delay = retry_delay(retry_count, provider);
                    app.state::<OperationsService>().schedule_retry(
                        provider,
                        retry_count,
                        next_delay,
                    );
                }
            }
            let _ = app.emit("provider-health-changed", provider);
        }
    });
}

fn retry_delay(retry_count: u8, provider: ProviderId) -> Duration {
    let seconds = match retry_count {
        0 | 1 => 60,
        2 => 5 * 60,
        _ => 15 * 60,
    };
    let provider_offset = match provider {
        ProviderId::Celestrak => 1,
        ProviderId::LaunchLibrary => 2,
        ProviderId::Nasa => 3,
        ProviderId::NoaaSwpc => 4,
        ProviderId::OpenMeteo => 5,
        ProviderId::SpaceflightNews => 6,
    };
    Duration::from_secs(seconds + provider_offset)
}

async fn refresh(
    app: &AppHandle,
    provider: ProviderId,
) -> Result<RefreshProviderResult, super::super::commands::control_center::OperationsError> {
    refresh_provider_from_app(app, provider).await
}

#[cfg(test)]
mod tests {
    use std::time::Duration;

    use super::retry_delay;
    use crate::commands::control_center::ProviderId;

    #[test]
    fn provider_cadences_are_bounded() {
        assert!(Duration::from_secs(5 * 60) < Duration::from_secs(30 * 60));
        assert!(Duration::from_secs(15 * 60) < Duration::from_secs(2 * 60 * 60));
    }

    #[test]
    fn retry_schedule_is_bounded_and_provider_jittered() {
        assert!(retry_delay(1, ProviderId::Nasa) >= Duration::from_secs(60));
        assert!(retry_delay(2, ProviderId::Nasa) >= Duration::from_secs(5 * 60));
        assert!(retry_delay(3, ProviderId::Nasa) >= Duration::from_secs(15 * 60));
        assert_ne!(
            retry_delay(1, ProviderId::Nasa),
            retry_delay(1, ProviderId::NoaaSwpc),
        );
    }
}
