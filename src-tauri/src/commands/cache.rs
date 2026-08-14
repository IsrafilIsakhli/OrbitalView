use std::{io, path::Path};

pub async fn write_atomic(path: &Path, bytes: &[u8]) -> Result<(), io::Error> {
    let file_name = path
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("cache.json");
    let nonce = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    let temporary =
        path.with_file_name(format!(".{file_name}.{}.{}.tmp", std::process::id(), nonce));
    tokio::fs::write(&temporary, bytes).await?;

    // Windows does not replace an existing destination with rename. Keep a
    // recoverable backup until the new, fully-written file is in place.
    let backup = path.with_file_name(format!(".{file_name}.backup"));
    let had_existing = tokio::fs::metadata(path).await.is_ok();
    if had_existing {
        let _ = tokio::fs::remove_file(&backup).await;
        tokio::fs::rename(path, &backup).await?;
    }

    match tokio::fs::rename(&temporary, path).await {
        Ok(()) => {
            if had_existing {
                let _ = tokio::fs::remove_file(backup).await;
            }
            Ok(())
        }
        Err(error) => {
            let _ = tokio::fs::remove_file(&temporary).await;
            if had_existing {
                let _ = tokio::fs::rename(&backup, path).await;
            }
            Err(error)
        }
    }
}
