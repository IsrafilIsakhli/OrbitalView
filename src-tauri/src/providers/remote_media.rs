use std::{path::Path, sync::Arc};

use reqwest::Url;
use tokio::sync::Semaphore;

use super::news_image::{NewsImageProvider, cache_key, prune_image_cache};
use crate::domain::news::NewsError;

#[derive(Clone, Copy, Debug)]
pub enum RemoteMediaScope {
    LaunchLibrary,
    Nasa,
}

impl RemoteMediaScope {
    pub const fn directory(self) -> &'static str {
        match self {
            Self::LaunchLibrary => "launch-library",
            Self::Nasa => "nasa",
        }
    }

    fn accepts_host(self, host: &str) -> bool {
        match self {
            Self::LaunchLibrary => {
                host.eq_ignore_ascii_case("thespacedevs-prod.nyc3.digitaloceanspaces.com")
            }
            Self::Nasa => {
                host.eq_ignore_ascii_case("nasa.gov")
                    || host.to_ascii_lowercase().ends_with(".nasa.gov")
            }
        }
    }
}

pub struct RemoteMediaProvider {
    image: NewsImageProvider,
    concurrency: Arc<Semaphore>,
}

impl RemoteMediaProvider {
    pub fn new() -> Result<Self, String> {
        Ok(Self {
            image: NewsImageProvider::new()?,
            concurrency: Arc::new(Semaphore::new(2)),
        })
    }

    pub async fn cache(
        &self,
        url: &str,
        scope: RemoteMediaScope,
        cache_root: &Path,
    ) -> Result<String, NewsError> {
        validate_provider_url(url, scope)?;
        let directory = cache_root.join("remote-media-v1").join(scope.directory());
        tokio::fs::create_dir_all(&directory)
            .await
            .map_err(|_| NewsError::new("image_cache_write", "media cache unavailable"))?;
        let target = directory.join(cache_key(url));
        if tokio::fs::metadata(&target).await.is_ok() {
            return Ok(target.to_string_lossy().into_owned());
        }
        let _permit = self
            .concurrency
            .acquire()
            .await
            .map_err(|_| NewsError::new("image_task", "media queue unavailable"))?;
        if tokio::fs::metadata(&target).await.is_err() {
            self.image
                .cache_image_scoped(url, &target, scope_host_validator(scope))
                .await?;
        }
        let _ = prune_image_cache(&directory).await;
        Ok(target.to_string_lossy().into_owned())
    }
}

fn scope_host_validator(scope: RemoteMediaScope) -> fn(&str) -> bool {
    match scope {
        RemoteMediaScope::LaunchLibrary => accepts_launch_library_host,
        RemoteMediaScope::Nasa => accepts_nasa_host,
    }
}

fn accepts_launch_library_host(host: &str) -> bool {
    RemoteMediaScope::LaunchLibrary.accepts_host(host)
}

fn accepts_nasa_host(host: &str) -> bool {
    RemoteMediaScope::Nasa.accepts_host(host)
}

fn validate_provider_url(url: &str, scope: RemoteMediaScope) -> Result<(), NewsError> {
    if url.len() > 2_048 {
        return Err(NewsError::new("image_url", "media URL is too long"));
    }
    let parsed = Url::parse(url).map_err(|_| NewsError::new("image_url", "invalid media URL"))?;
    let host = parsed
        .host_str()
        .ok_or_else(|| NewsError::new("image_url", "missing media host"))?;
    if parsed.scheme() != "https"
        || parsed.port_or_known_default() != Some(443)
        || !parsed.username().is_empty()
        || parsed.password().is_some()
        || !scope.accepts_host(host)
    {
        return Err(NewsError::new(
            "image_url",
            "media host is outside provider scope",
        ));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{RemoteMediaScope, validate_provider_url};

    #[test]
    fn media_hosts_are_scoped_to_the_owning_provider() {
        assert!(
            validate_provider_url(
                "https://apod.nasa.gov/apod/image.jpg",
                RemoteMediaScope::Nasa
            )
            .is_ok()
        );
        assert!(
            validate_provider_url(
                "https://images-assets.nasa.gov/image.jpg",
                RemoteMediaScope::Nasa
            )
            .is_ok()
        );
        assert!(
            validate_provider_url("https://example.com/image.jpg", RemoteMediaScope::Nasa).is_err()
        );
        assert!(
            validate_provider_url("http://apod.nasa.gov/image.jpg", RemoteMediaScope::Nasa)
                .is_err()
        );
        assert!(
            validate_provider_url(
                "https://apod.nasa.gov/image.jpg",
                RemoteMediaScope::LaunchLibrary
            )
            .is_err()
        );
    }
}
