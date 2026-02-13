import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "node:http";
import { pool, initializeDatabase } from "./db";
import bcrypt from "bcryptjs";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";

declare module "express-session" {
  interface SessionData {
    userId: number;
    username: string;
  }
}

function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function transformLead(row: any) {
  return {
    id: row.id,
    name: row.name,
    company: row.company,
    area: row.area,
    phone: row.phone,
    email: row.email,
    stage: row.stage,
    notes: row.notes,
    source: row.source,
    address: row.address,
    mobile: row.mobile,
    leadType: row.lead_type,
    assignedStaff: row.assigned_staff,
    lastVisitDate: row.last_visit_date,
    locationLat: row.location_lat,
    locationLng: row.location_lng,
    userId: row.user_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.session.userId) {
    return res.status(401).json({ message: "Not authenticated" });
  }
  next();
}

async function getOrCreateDayRecord(userId: number, date: string): Promise<any> {
  await pool.query(
    `INSERT INTO day_records (user_id, date) VALUES ($1, $2) ON CONFLICT (user_id, date) DO NOTHING`,
    [userId, date]
  );
  const result = await pool.query(
    `SELECT * FROM day_records WHERE user_id = $1 AND date = $2`,
    [userId, date]
  );
  return result.rows[0];
}

export async function registerRoutes(app: Express): Promise<Server> {
  await initializeDatabase();

  const PgStore = connectPgSimple(session);

  app.use(
    session({
      store: new PgStore({
        pool: pool,
        createTableIfMissing: true,
      }),
      secret: process.env.SESSION_SECRET || "field-staff-tracker-secret-key",
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        secure: false,
        sameSite: "lax",
        maxAge: 7 * 24 * 60 * 60 * 1000,
      },
    })
  );

  // AUTH ROUTES
  app.post("/api/auth/register", async (req: Request, res: Response) => {
    try {
      const { username, password, name } = req.body;
      if (!username || !password || !name) {
        return res.status(400).json({ message: "Username, password, and name are required" });
      }
      const existing = await pool.query("SELECT id FROM users WHERE username = $1", [username]);
      if (existing.rows.length > 0) {
        return res.status(400).json({ message: "Username already exists" });
      }
      const passwordHash = await bcrypt.hash(password, 10);
      const result = await pool.query(
        "INSERT INTO users (username, password_hash, name) VALUES ($1, $2, $3) RETURNING id, username, name, role",
        [username, passwordHash, name]
      );
      const user = result.rows[0];
      req.session.userId = user.id;
      req.session.username = user.username;
      return res.status(201).json({ id: user.id, username: user.username, name: user.name, role: user.role });
    } catch (error: any) {
      console.error("Register error:", error);
      return res.status(500).json({ message: "Failed to register" });
    }
  });

  app.post("/api/auth/login", async (req: Request, res: Response) => {
    try {
      const { username, password } = req.body;
      if (!username || !password) {
        return res.status(400).json({ message: "Username and password are required" });
      }
      const result = await pool.query("SELECT * FROM users WHERE username = $1", [username]);
      if (result.rows.length === 0) {
        return res.status(401).json({ message: "Invalid credentials" });
      }
      const user = result.rows[0];
      const valid = await bcrypt.compare(password, user.password_hash);
      if (!valid) {
        return res.status(401).json({ message: "Invalid credentials" });
      }
      req.session.userId = user.id;
      req.session.username = user.username;
      return res.json({ id: user.id, username: user.username, name: user.name, role: user.role });
    } catch (error: any) {
      console.error("Login error:", error);
      return res.status(500).json({ message: "Failed to login" });
    }
  });

  app.post("/api/auth/logout", (req: Request, res: Response) => {
    req.session.destroy((err) => {
      if (err) {
        return res.status(500).json({ message: "Failed to logout" });
      }
      return res.json({ message: "Logged out" });
    });
  });

  app.get("/api/auth/me", requireAuth, async (req: Request, res: Response) => {
    try {
      const result = await pool.query("SELECT id, username, name, role FROM users WHERE id = $1", [req.session.userId]);
      if (result.rows.length === 0) {
        return res.status(404).json({ message: "User not found" });
      }
      return res.json(result.rows[0]);
    } catch (error: any) {
      console.error("Get user error:", error);
      return res.status(500).json({ message: "Failed to get user" });
    }
  });

  // LEAD TYPES
  app.get("/api/lead-types", async (_req: Request, res: Response) => {
    try {
      const result = await pool.query("SELECT name FROM lead_types ORDER BY name");
      return res.json(result.rows.map((r: any) => r.name));
    } catch (error: any) {
      console.error("Get lead types error:", error);
      return res.status(500).json({ message: "Failed to get lead types" });
    }
  });

  app.post("/api/lead-types", async (req: Request, res: Response) => {
    try {
      const { name } = req.body;
      if (!name) {
        return res.status(400).json({ message: "Name is required" });
      }
      await pool.query("INSERT INTO lead_types (name) VALUES ($1) ON CONFLICT (name) DO NOTHING", [name]);
      const result = await pool.query("SELECT name FROM lead_types ORDER BY name");
      return res.json(result.rows.map((r: any) => r.name));
    } catch (error: any) {
      console.error("Add lead type error:", error);
      return res.status(500).json({ message: "Failed to add lead type" });
    }
  });

  // LEADS
  app.get("/api/leads", requireAuth, async (req: Request, res: Response) => {
    try {
      const result = await pool.query("SELECT * FROM leads WHERE user_id = $1 ORDER BY created_at DESC", [req.session.userId]);
      return res.json(result.rows.map(transformLead));
    } catch (error: any) {
      console.error("Get leads error:", error);
      return res.status(500).json({ message: "Failed to get leads" });
    }
  });

  app.post("/api/leads", requireAuth, async (req: Request, res: Response) => {
    try {
      const { name, company, area, phone, email, stage, notes, source, address, mobile, leadType, assignedStaff, lastVisitDate, locationLat, locationLng } = req.body;
      const result = await pool.query(
        `INSERT INTO leads (name, company, area, phone, email, stage, notes, source, address, mobile, lead_type, assigned_staff, last_visit_date, location_lat, location_lng, user_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16) RETURNING *`,
        [
          name || "", company || "", area || "", phone || "", email || "",
          stage || "New", notes || "", source || "", address || "", mobile || "",
          leadType || "", assignedStaff || "Self", lastVisitDate || null,
          locationLat || null, locationLng || null, req.session.userId,
        ]
      );
      return res.status(201).json(transformLead(result.rows[0]));
    } catch (error: any) {
      console.error("Create lead error:", error);
      return res.status(500).json({ message: "Failed to create lead" });
    }
  });

  app.get("/api/leads/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const result = await pool.query("SELECT * FROM leads WHERE id = $1 AND user_id = $2", [req.params.id, req.session.userId]);
      if (result.rows.length === 0) {
        return res.status(404).json({ message: "Lead not found" });
      }
      return res.json(transformLead(result.rows[0]));
    } catch (error: any) {
      console.error("Get lead error:", error);
      return res.status(500).json({ message: "Failed to get lead" });
    }
  });

  app.put("/api/leads/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const { name, company, area, phone, email, stage, notes, source, address, mobile, leadType, assignedStaff, lastVisitDate, locationLat, locationLng } = req.body;
      const result = await pool.query(
        `UPDATE leads SET name = COALESCE($1, name), company = COALESCE($2, company), area = COALESCE($3, area),
         phone = COALESCE($4, phone), email = COALESCE($5, email), stage = COALESCE($6, stage),
         notes = COALESCE($7, notes), source = COALESCE($8, source), address = COALESCE($9, address),
         mobile = COALESCE($10, mobile), lead_type = COALESCE($11, lead_type), assigned_staff = COALESCE($12, assigned_staff),
         last_visit_date = COALESCE($13, last_visit_date), location_lat = COALESCE($14, location_lat),
         location_lng = COALESCE($15, location_lng), updated_at = NOW()
         WHERE id = $16 AND user_id = $17 RETURNING *`,
        [
          name, company, area, phone, email, stage, notes, source, address, mobile,
          leadType, assignedStaff, lastVisitDate, locationLat, locationLng,
          req.params.id, req.session.userId,
        ]
      );
      if (result.rows.length === 0) {
        return res.status(404).json({ message: "Lead not found" });
      }
      return res.json(transformLead(result.rows[0]));
    } catch (error: any) {
      console.error("Update lead error:", error);
      return res.status(500).json({ message: "Failed to update lead" });
    }
  });

  app.delete("/api/leads/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const result = await pool.query("DELETE FROM leads WHERE id = $1 AND user_id = $2 RETURNING id", [req.params.id, req.session.userId]);
      if (result.rows.length === 0) {
        return res.status(404).json({ message: "Lead not found" });
      }
      return res.json({ message: "Lead deleted" });
    } catch (error: any) {
      console.error("Delete lead error:", error);
      return res.status(500).json({ message: "Failed to delete lead" });
    }
  });

  // DAY RECORDS
  app.get("/api/day-record", requireAuth, async (req: Request, res: Response) => {
    try {
      const date = (req.query.date as string) || new Date().toISOString().split("T")[0];
      const dayRecord = await getOrCreateDayRecord(req.session.userId!, date);

      const [routePointsResult, visitsResult, callsResult, activitiesResult] = await Promise.all([
        pool.query("SELECT latitude, longitude, timestamp FROM route_points WHERE day_record_id = $1 ORDER BY timestamp", [dayRecord.id]),
        pool.query("SELECT * FROM visits WHERE day_record_id = $1 ORDER BY timestamp", [dayRecord.id]),
        pool.query("SELECT * FROM calls WHERE day_record_id = $1 ORDER BY timestamp", [dayRecord.id]),
        pool.query("SELECT * FROM activities WHERE day_record_id = $1 ORDER BY timestamp", [dayRecord.id]),
      ]);

      const checkInLocation = dayRecord.check_in_lat != null && dayRecord.check_in_lng != null
        ? { latitude: dayRecord.check_in_lat, longitude: dayRecord.check_in_lng, timestamp: dayRecord.check_in_timestamp || 0 }
        : null;

      return res.json({
        date: dayRecord.date,
        checkInTime: dayRecord.check_in_time,
        checkOutTime: dayRecord.check_out_time,
        checkInLocation,
        routePoints: routePointsResult.rows.map((r: any) => ({
          latitude: r.latitude,
          longitude: r.longitude,
          timestamp: r.timestamp,
        })),
        visits: visitsResult.rows.map((r: any) => ({
          id: r.id,
          leadId: r.lead_id,
          leadName: r.lead_name,
          type: r.type,
          latitude: r.latitude,
          longitude: r.longitude,
          address: r.address,
          notes: r.notes,
          timestamp: r.timestamp,
          duration: r.duration,
        })),
        calls: callsResult.rows.map((r: any) => ({
          id: r.id,
          leadId: r.lead_id,
          leadName: r.lead_name,
          type: r.type,
          duration: r.duration,
          notes: r.notes,
          timestamp: r.timestamp,
        })),
        activities: activitiesResult.rows.map((r: any) => ({
          id: r.id,
          leadId: r.lead_id,
          leadName: r.lead_name,
          type: r.type,
          description: r.description,
          timestamp: r.timestamp,
        })),
        totalDistance: dayRecord.total_distance || 0,
      });
    } catch (error: any) {
      console.error("Get day record error:", error);
      return res.status(500).json({ message: "Failed to get day record" });
    }
  });

  app.post("/api/day-record/check-in", requireAuth, async (req: Request, res: Response) => {
    try {
      const { latitude, longitude, timestamp } = req.body;
      const today = new Date().toISOString().split("T")[0];
      const dayRecord = await getOrCreateDayRecord(req.session.userId!, today);

      await pool.query(
        `UPDATE day_records SET check_in_time = NOW(), check_in_lat = $1, check_in_lng = $2, check_in_timestamp = $3 WHERE id = $4`,
        [latitude, longitude, timestamp, dayRecord.id]
      );

      const updated = await pool.query("SELECT * FROM day_records WHERE id = $1", [dayRecord.id]);
      const rec = updated.rows[0];
      return res.json({
        date: rec.date,
        checkInTime: rec.check_in_time,
        checkOutTime: rec.check_out_time,
        checkInLocation: rec.check_in_lat != null ? { latitude: rec.check_in_lat, longitude: rec.check_in_lng, timestamp: rec.check_in_timestamp || 0 } : null,
        totalDistance: rec.total_distance || 0,
      });
    } catch (error: any) {
      console.error("Check-in error:", error);
      return res.status(500).json({ message: "Failed to check in" });
    }
  });

  app.post("/api/day-record/check-out", requireAuth, async (req: Request, res: Response) => {
    try {
      const today = new Date().toISOString().split("T")[0];
      const result = await pool.query(
        `UPDATE day_records SET check_out_time = NOW() WHERE user_id = $1 AND date = $2 RETURNING *`,
        [req.session.userId, today]
      );
      if (result.rows.length === 0) {
        return res.status(404).json({ message: "No day record found for today" });
      }
      const rec = result.rows[0];
      return res.json({
        date: rec.date,
        checkInTime: rec.check_in_time,
        checkOutTime: rec.check_out_time,
        totalDistance: rec.total_distance || 0,
      });
    } catch (error: any) {
      console.error("Check-out error:", error);
      return res.status(500).json({ message: "Failed to check out" });
    }
  });

  // ROUTE POINTS
  app.post("/api/route-points", requireAuth, async (req: Request, res: Response) => {
    try {
      const { latitude, longitude, timestamp } = req.body;
      const today = new Date().toISOString().split("T")[0];
      const dayRecord = await getOrCreateDayRecord(req.session.userId!, today);

      await pool.query(
        "INSERT INTO route_points (day_record_id, latitude, longitude, timestamp) VALUES ($1, $2, $3, $4)",
        [dayRecord.id, latitude, longitude, timestamp]
      );

      const lastPoints = await pool.query(
        "SELECT latitude, longitude FROM route_points WHERE day_record_id = $1 ORDER BY timestamp DESC LIMIT 2",
        [dayRecord.id]
      );

      if (lastPoints.rows.length >= 2) {
        const [current, previous] = lastPoints.rows;
        const dist = calculateDistance(previous.latitude, previous.longitude, current.latitude, current.longitude);
        await pool.query(
          "UPDATE day_records SET total_distance = total_distance + $1 WHERE id = $2",
          [dist, dayRecord.id]
        );
      }

      return res.status(201).json({ message: "Route point added" });
    } catch (error: any) {
      console.error("Add route point error:", error);
      return res.status(500).json({ message: "Failed to add route point" });
    }
  });

  // VISITS
  app.post("/api/visits", requireAuth, async (req: Request, res: Response) => {
    try {
      const { leadId, leadName, type, latitude, longitude, address, notes, duration } = req.body;
      const today = new Date().toISOString().split("T")[0];
      const dayRecord = await getOrCreateDayRecord(req.session.userId!, today);

      const visitResult = await pool.query(
        `INSERT INTO visits (day_record_id, lead_id, lead_name, type, latitude, longitude, address, notes, duration)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
        [dayRecord.id, leadId, leadName, type, latitude, longitude, address || "", notes || "", duration || 0]
      );

      if (leadId) {
        await pool.query(
          `UPDATE leads SET last_visit_date = $1, stage = CASE WHEN stage = 'New' THEN 'In Process' ELSE stage END, updated_at = NOW() WHERE id = $2`,
          [today, leadId]
        );
      }

      await pool.query(
        `INSERT INTO activities (day_record_id, lead_id, lead_name, type, description)
         VALUES ($1, $2, $3, $4, $5)`,
        [dayRecord.id, leadId, leadName, type, `${type} at ${address || "unknown location"}`]
      );

      const v = visitResult.rows[0];
      return res.status(201).json({
        id: v.id,
        leadId: v.lead_id,
        leadName: v.lead_name,
        type: v.type,
        latitude: v.latitude,
        longitude: v.longitude,
        address: v.address,
        notes: v.notes,
        timestamp: v.timestamp,
        duration: v.duration,
      });
    } catch (error: any) {
      console.error("Add visit error:", error);
      return res.status(500).json({ message: "Failed to add visit" });
    }
  });

  app.get("/api/visits", requireAuth, async (req: Request, res: Response) => {
    try {
      const { leadId } = req.query;
      const result = await pool.query(
        `SELECT v.* FROM visits v
         JOIN day_records d ON v.day_record_id = d.id
         WHERE d.user_id = $1 AND ($2::uuid IS NULL OR v.lead_id = $2::uuid)
         ORDER BY v.timestamp DESC`,
        [req.session.userId, leadId || null]
      );
      return res.json(result.rows.map((r: any) => ({
        id: r.id,
        leadId: r.lead_id,
        leadName: r.lead_name,
        type: r.type,
        latitude: r.latitude,
        longitude: r.longitude,
        address: r.address,
        notes: r.notes,
        timestamp: r.timestamp,
        duration: r.duration,
      })));
    } catch (error: any) {
      console.error("Get visits error:", error);
      return res.status(500).json({ message: "Failed to get visits" });
    }
  });

  // CALLS
  app.post("/api/calls", requireAuth, async (req: Request, res: Response) => {
    try {
      const { leadId, leadName, type, duration, notes } = req.body;
      const today = new Date().toISOString().split("T")[0];
      const dayRecord = await getOrCreateDayRecord(req.session.userId!, today);

      const callResult = await pool.query(
        `INSERT INTO calls (day_record_id, lead_id, lead_name, type, duration, notes)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [dayRecord.id, leadId, leadName, type, duration || 0, notes || ""]
      );

      await pool.query(
        `INSERT INTO activities (day_record_id, lead_id, lead_name, type, description)
         VALUES ($1, $2, $3, 'Call', $4)`,
        [dayRecord.id, leadId, leadName, `${type} call - ${duration || 0}s`]
      );

      if (leadId) {
        await pool.query(
          `UPDATE leads SET stage = CASE WHEN stage = 'New' THEN 'In Process' ELSE stage END, updated_at = NOW() WHERE id = $1`,
          [leadId]
        );
      }

      const c = callResult.rows[0];
      return res.status(201).json({
        id: c.id,
        leadId: c.lead_id,
        leadName: c.lead_name,
        type: c.type,
        duration: c.duration,
        notes: c.notes,
        timestamp: c.timestamp,
      });
    } catch (error: any) {
      console.error("Add call error:", error);
      return res.status(500).json({ message: "Failed to add call" });
    }
  });

  app.get("/api/calls", requireAuth, async (req: Request, res: Response) => {
    try {
      const { leadId } = req.query;
      const result = await pool.query(
        `SELECT c.* FROM calls c
         JOIN day_records d ON c.day_record_id = d.id
         WHERE d.user_id = $1 AND ($2::uuid IS NULL OR c.lead_id = $2::uuid)
         ORDER BY c.timestamp DESC`,
        [req.session.userId, leadId || null]
      );
      return res.json(result.rows.map((r: any) => ({
        id: r.id,
        leadId: r.lead_id,
        leadName: r.lead_name,
        type: r.type,
        duration: r.duration,
        notes: r.notes,
        timestamp: r.timestamp,
      })));
    } catch (error: any) {
      console.error("Get calls error:", error);
      return res.status(500).json({ message: "Failed to get calls" });
    }
  });

  // ACTIVITIES
  app.post("/api/activities", requireAuth, async (req: Request, res: Response) => {
    try {
      const { leadId, leadName, type, description } = req.body;
      const today = new Date().toISOString().split("T")[0];
      const dayRecord = await getOrCreateDayRecord(req.session.userId!, today);

      const result = await pool.query(
        `INSERT INTO activities (day_record_id, lead_id, lead_name, type, description)
         VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [dayRecord.id, leadId, leadName, type, description || ""]
      );

      const a = result.rows[0];
      return res.status(201).json({
        id: a.id,
        leadId: a.lead_id,
        leadName: a.lead_name,
        type: a.type,
        description: a.description,
        timestamp: a.timestamp,
      });
    } catch (error: any) {
      console.error("Add activity error:", error);
      return res.status(500).json({ message: "Failed to add activity" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
