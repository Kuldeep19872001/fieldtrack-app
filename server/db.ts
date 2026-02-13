import pg from 'pg';
const { Pool } = pg;

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

export async function initializeDatabase() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username VARCHAR(100) UNIQUE NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      name VARCHAR(255) NOT NULL,
      role VARCHAR(100) DEFAULT 'Field Executive',
      created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS leads (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name VARCHAR(255) NOT NULL,
      company VARCHAR(255) DEFAULT '',
      area VARCHAR(255) DEFAULT '',
      phone VARCHAR(50) DEFAULT '',
      email VARCHAR(255) DEFAULT '',
      stage VARCHAR(50) DEFAULT 'New' CHECK (stage IN ('New', 'In Process', 'Converted')),
      notes TEXT DEFAULT '',
      source VARCHAR(100) DEFAULT '',
      address TEXT DEFAULT '',
      mobile VARCHAR(50) DEFAULT '',
      lead_type VARCHAR(100) DEFAULT '',
      assigned_staff VARCHAR(255) DEFAULT 'Self',
      last_visit_date DATE NULL,
      location_lat DOUBLE PRECISION NULL,
      location_lng DOUBLE PRECISION NULL,
      user_id INTEGER REFERENCES users(id),
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS day_records (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) NOT NULL,
      date DATE NOT NULL,
      check_in_time TIMESTAMP NULL,
      check_out_time TIMESTAMP NULL,
      check_in_lat DOUBLE PRECISION NULL,
      check_in_lng DOUBLE PRECISION NULL,
      check_in_timestamp BIGINT NULL,
      total_distance DOUBLE PRECISION DEFAULT 0,
      UNIQUE(user_id, date)
    );

    CREATE TABLE IF NOT EXISTS route_points (
      id SERIAL PRIMARY KEY,
      day_record_id INTEGER REFERENCES day_records(id) ON DELETE CASCADE,
      latitude DOUBLE PRECISION NOT NULL,
      longitude DOUBLE PRECISION NOT NULL,
      timestamp BIGINT NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS visits (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      day_record_id INTEGER REFERENCES day_records(id) ON DELETE CASCADE,
      lead_id UUID REFERENCES leads(id),
      lead_name VARCHAR(255) NOT NULL,
      type VARCHAR(50) NOT NULL,
      latitude DOUBLE PRECISION NOT NULL,
      longitude DOUBLE PRECISION NOT NULL,
      address TEXT DEFAULT '',
      notes TEXT DEFAULT '',
      duration INTEGER DEFAULT 0,
      timestamp TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS calls (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      day_record_id INTEGER REFERENCES day_records(id) ON DELETE CASCADE,
      lead_id UUID REFERENCES leads(id),
      lead_name VARCHAR(255) NOT NULL,
      type VARCHAR(50) NOT NULL CHECK (type IN ('Outbound', 'Inbound')),
      duration INTEGER DEFAULT 0,
      notes TEXT DEFAULT '',
      timestamp TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS activities (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      day_record_id INTEGER REFERENCES day_records(id) ON DELETE CASCADE,
      lead_id UUID REFERENCES leads(id),
      lead_name VARCHAR(255) NOT NULL,
      type VARCHAR(100) NOT NULL,
      description TEXT DEFAULT '',
      timestamp TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS lead_types (
      id SERIAL PRIMARY KEY,
      name VARCHAR(100) UNIQUE NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    );

    INSERT INTO lead_types (name) VALUES
      ('Doctor'),
      ('Nursing Home'),
      ('School'),
      ('Ambulance'),
      ('College'),
      ('KOL'),
      ('Individual'),
      ('NGO'),
      ('Hospital'),
      ('Clinic'),
      ('Pharmacy'),
      ('Other')
    ON CONFLICT (name) DO NOTHING;
  `);
}
