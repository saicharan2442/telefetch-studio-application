// Tests never touch a real database or Telegram; the pool is created lazily and unused.
process.env.DATABASE_URL ??= "postgresql://postgres:postgres@127.0.0.1:5432/telefetch_test";
