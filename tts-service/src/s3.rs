use aws_config::meta::region::RegionProviderChain;
use aws_config::BehaviorVersion;
use aws_sdk_s3::config::{Credentials, Region};
use aws_sdk_s3::Client;
use std::collections::HashMap;

pub async fn get_s3_client() -> Option<Client> {
    let account_id = std::env::var("R2_ACCOUNT_ID").ok()?;
    let access_key = std::env::var("R2_ACCESS_KEY_ID").ok()?;
    let secret_key = std::env::var("R2_SECRET_ACCESS_KEY").ok()?;

    let endpoint = format!("https://{}.r2.cloudflarestorage.com", account_id);

    let region_provider = RegionProviderChain::default_provider().or_else(Region::new("auto"));

    let credentials = Credentials::new(
        access_key,
        secret_key,
        None,
        None,
        "Static",
    );

    let config = aws_config::defaults(BehaviorVersion::latest())
        .region(region_provider)
        .endpoint_url(endpoint)
        .credentials_provider(credentials)
        .load()
        .await;

    Some(Client::new(&config))
}

pub async fn list_r2_objects(client: &Client, bucket: &str) -> anyhow::Result<HashMap<String, u64>> {
    let mut objects = HashMap::new();
    let mut continuation_token = None;

    loop {
        let mut req = client
            .list_objects_v2()
            .bucket(bucket)
            .prefix("audio/");

        if let Some(token) = continuation_token {
            req = req.continuation_token(token);
        }

        let resp = req.send().await?;

        for obj in resp.contents() {
            if let (Some(key), Some(size)) = (obj.key(), obj.size()) {
                let cleaned_key = key.replace("audio/", "");
                objects.insert(cleaned_key, size as u64);
            }
        }

        continuation_token = resp.next_continuation_token().map(|s| s.to_string());
        if !resp.is_truncated().unwrap_or(false) {
            break;
        }
    }

    Ok(objects)
}

pub async fn upload_to_r2(
    client: &Client,
    bucket: &str,
    file_path: &str,
    key: &str,
    content_type: &str,
) -> anyhow::Result<()> {
    let body = aws_sdk_s3::primitives::ByteStream::from_path(file_path).await?;
    let full_key = format!("audio/{}", key);

    client
        .put_object()
        .bucket(bucket)
        .key(full_key)
        .body(body)
        .content_type(content_type)
        .send()
        .await?;

    Ok(())
}
