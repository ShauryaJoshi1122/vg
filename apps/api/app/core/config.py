from pydantic_settings import BaseSettings


class Settings(BaseSettings):
  app_env: str = "local"
  database_url: str = ""
  redis_url: str = ""

  jwt_secret: str = ""
  jwt_alg: str = "HS256"

  s3_bucket: str = ""
  s3_region: str = "us-east-1"
  s3_endpoint_url: str | None = None
  s3_access_key: str | None = None
  s3_secret_key: str | None = None

  flow_base_url: str = ""
  flow_api_key: str | None = None
  flow_visual_endpoint: str = "/v1/visuals:generate"
  flow_tts_endpoint: str = "/v1/tts:synthesize"

  llm_base_url: str = "https://api.openai.com/v1"
  llm_api_key: str | None = None
  llm_model: str = "gpt-4o-mini"

  # Stripe billing
  stripe_secret_key: str | None = None
  stripe_price_pro_id: str | None = None
  stripe_webhook_secret: str | None = None
  stripe_success_url: str = "http://localhost:3000/billing/success"
  stripe_cancel_url: str = "http://localhost:3000/billing/cancel"

  class Config:
    env_file = ".env"
    case_sensitive = False


settings = Settings()  # instantiated at import-time for simplicity

