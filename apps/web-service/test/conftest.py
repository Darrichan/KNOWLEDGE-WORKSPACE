import os

os.environ.setdefault("APP_ENV", "test")
os.environ.setdefault("SECRET_KEY", "test-secret-key-that-is-longer-than-32-characters")
os.environ.setdefault(
    "DATABASE_URL", "postgresql+psycopg://zhiliu:zhiliu@localhost:5432/zhiliu_test"
)
