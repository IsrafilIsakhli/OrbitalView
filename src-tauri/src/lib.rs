mod commands;
mod domain;
mod providers;
mod services;
mod storage;

use commands::{
    analysis::{
        analysis_ground_stations, delete_analysis_ground_station, export_orbital_analysis,
        save_analysis_ground_station,
    },
    control_center::{
        OperationsService, clear_provider_cache, control_center_snapshot, refresh_provider,
        set_background_sync_enabled,
    },
    credentials::{
        delete_nasa_credential, nasa_credential_status, set_nasa_credential, verify_nasa_credential,
    },
    external::open_external_url,
    launches::{
        LaunchIntelligenceService, completed_launches, launch_detail, launch_weather,
        rocket_configuration, space_intelligence,
    },
    nasa::{NasaIntelligenceService, nasa_intelligence},
    news::{
        clear_space_news_translations, search_space_news, space_news_detail, space_news_feed,
        space_news_for_relation, space_news_image, space_news_source_catalog,
    },
    noaa::{NoaaSpaceWeatherService, noaa_space_weather},
    remote_media::cache_remote_media,
    satellite_media::satellite_object_media,
    satellites::{SatelliteCatalogService, active_satellite_catalog},
    system::runtime_info,
};
use domain::credentials::NasaCredentialSource;
use providers::nasa::{load_fallback_api_key, normalize_api_key};
use providers::remote_media::RemoteMediaProvider;
use providers::satellite_media::SatelliteMediaProvider;
use services::{analysis_service::AnalysisService, news_service::NewsService};
use services::{credential_store::CredentialStore, provider_scheduler::spawn_background_tasks};
use tauri::Manager;

const UPDATER_PUBLIC_KEY: &str = "dW50cnVzdGVkIGNvbW1lbnQ6IG1pbmlzaWduIHB1YmxpYyBrZXk6IDQ5ODA1RUNENzI1RjRCNEEKUldSS1MxOXl6VjZBU1FBMmNBT1IveG5PbVRYTmxTQmVqS2NKNlJGR29YakdKdXdNQ3U2ZS9FSkYK";

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let satellite_catalog_service = SatelliteCatalogService::new()
        .expect("Orbital Vision failed to initialize its satellite data client");
    let launch_intelligence_service = LaunchIntelligenceService::new()
        .expect("Orbital Vision failed to initialize its launch data client");
    let initial_nasa_credential = CredentialStore::read_initial_nasa_key()
        .and_then(|api_key| normalize_api_key(&api_key))
        .map(|api_key| (api_key, NasaCredentialSource::CredentialStore))
        .or_else(load_fallback_api_key);
    let nasa_intelligence_service = NasaIntelligenceService::new(initial_nasa_credential)
        .expect("Orbital Vision failed to initialize its NASA data client");
    let noaa_space_weather_service = NoaaSpaceWeatherService::new()
        .expect("Orbital Vision failed to initialize its NOAA SWPC data client");

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_process::init())
        .plugin(
            tauri_plugin_updater::Builder::new()
                .pubkey(UPDATER_PUBLIC_KEY)
                .build(),
        )
        .manage(satellite_catalog_service)
        .manage(launch_intelligence_service)
        .manage(nasa_intelligence_service)
        .manage(noaa_space_weather_service)
        .manage(
            RemoteMediaProvider::new()
                .expect("Orbital Vision failed to initialize its media cache"),
        )
        .manage(
            SatelliteMediaProvider::new()
                .expect("Orbital Vision failed to initialize satellite media enrichment"),
        )
        .manage(CredentialStore::default())
        .setup(|app| {
            let app_data = app.path().app_data_dir()?;
            let app_cache = app.path().app_cache_dir()?;
            app.manage(OperationsService::with_persistence(
                app_data.join("operations-health-v1.json"),
            ));
            let news_service = NewsService::new(
                app_data.join("orbital-vision-news-v1.sqlite3"),
                app_cache.join("space-news-images-v1"),
            );
            app.manage(news_service);
            app.manage(AnalysisService::new(
                app_data.join("orbital-vision-analysis-v1.sqlite3"),
            ));
            spawn_background_tasks(app.handle().clone());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            analysis_ground_stations,
            active_satellite_catalog,
            clear_provider_cache,
            clear_space_news_translations,
            cache_remote_media,
            completed_launches,
            control_center_snapshot,
            delete_nasa_credential,
            delete_analysis_ground_station,
            export_orbital_analysis,
            launch_detail,
            launch_weather,
            nasa_intelligence,
            nasa_credential_status,
            noaa_space_weather,
            open_external_url,
            refresh_provider,
            rocket_configuration,
            satellite_object_media,
            save_analysis_ground_station,
            set_background_sync_enabled,
            set_nasa_credential,
            search_space_news,
            space_news_detail,
            space_news_feed,
            space_news_for_relation,
            space_news_image,
            space_news_source_catalog,
            space_intelligence,
            verify_nasa_credential,
            runtime_info
        ])
        .run(tauri::generate_context!())
        .expect("Orbital Vision failed to start");
}
