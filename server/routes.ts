import type { Express, Request, Response } from "express";
import { createServer, type Server } from "node:http";
import { createHmac } from "node:crypto";
import { Resend } from "resend";
import { createClient } from "@supabase/supabase-js";

const RESEND_API_KEY = process.env.RESEND_API_KEY || "";
const SESSION_SECRET = process.env.SESSION_SECRET || "default-secret";
const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || "";
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || "";

const resend = RESEND_API_KEY ? new Resend(RESEND_API_KEY) : null;

const supabaseServer = SUPABASE_URL && SUPABASE_ANON_KEY
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;

function generateToken(requestId: string, action: string): string {
  return createHmac("sha256", SESSION_SECRET)
    .update(`${requestId}:${action}`)
    .digest("hex");
}

function verifyToken(requestId: string, action: string, token: string): boolean {
  const expected = generateToken(requestId, action);
  return expected === token;
}

function getBaseUrl(req: Request): string {
  const proto = req.header("x-forwarded-proto") || req.protocol || "https";
  const host = req.header("x-forwarded-host") || req.get("host");
  return `${proto}://${host}`;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00");
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function buildEmailHtml(params: {
  userName: string;
  leaveType: string;
  fromDate: string;
  toDate: string;
  days: number;
  reason: string;
  approveUrl: string;
  rejectUrl: string;
}): string {
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#f4f6f9;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f6f9;padding:32px 16px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.06);">
        <tr><td style="background:linear-gradient(135deg,#0066FF,#0A1628);padding:28px 32px;">
          <h1 style="margin:0;color:#fff;font-size:20px;">Leave Request</h1>
          <p style="margin:6px 0 0;color:rgba(255,255,255,0.8);font-size:14px;">FieldTrack Notification</p>
        </td></tr>
        <tr><td style="padding:28px 32px;">
          <p style="margin:0 0 20px;font-size:15px;color:#333;">
            <strong>${params.userName}</strong> has submitted a leave request for your review.
          </p>
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border-radius:12px;padding:4px;">
            <tr><td style="padding:12px 16px;border-bottom:1px solid #e2e8f0;">
              <span style="color:#64748b;font-size:12px;">Leave Type</span><br>
              <strong style="color:#1e293b;font-size:15px;">${params.leaveType}</strong>
            </td></tr>
            <tr><td style="padding:12px 16px;border-bottom:1px solid #e2e8f0;">
              <span style="color:#64748b;font-size:12px;">Duration</span><br>
              <strong style="color:#1e293b;font-size:15px;">${formatDate(params.fromDate)} — ${formatDate(params.toDate)} (${params.days} day${params.days > 1 ? "s" : ""})</strong>
            </td></tr>
            <tr><td style="padding:12px 16px;">
              <span style="color:#64748b;font-size:12px;">Reason</span><br>
              <span style="color:#1e293b;font-size:14px;">${params.reason}</span>
            </td></tr>
          </table>
          <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:28px;">
            <tr>
              <td width="48%" align="center" style="padding-right:8px;">
                <a href="${params.approveUrl}" style="display:block;padding:14px;background:#16a34a;color:#fff;text-decoration:none;border-radius:10px;font-weight:bold;font-size:15px;text-align:center;">
                  &#10003; Approve
                </a>
              </td>
              <td width="48%" align="center" style="padding-left:8px;">
                <a href="${params.rejectUrl}" style="display:block;padding:14px;background:#dc2626;color:#fff;text-decoration:none;border-radius:10px;font-weight:bold;font-size:15px;text-align:center;">
                  &#10007; Reject
                </a>
              </td>
            </tr>
          </table>
          <p style="margin:24px 0 0;font-size:12px;color:#94a3b8;text-align:center;">
            Click a button above to approve or reject this leave request.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function buildResultHtml(title: string, message: string, color: string): string {
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title}</title></head>
<body style="margin:0;padding:0;background:#f4f6f9;font-family:Arial,sans-serif;display:flex;justify-content:center;align-items:center;min-height:100vh;">
  <div style="background:#fff;border-radius:16px;padding:40px;max-width:400px;text-align:center;box-shadow:0 2px 12px rgba(0,0,0,0.08);">
    <div style="width:64px;height:64px;border-radius:50%;background:${color}15;display:flex;align-items:center;justify-content:center;margin:0 auto 20px;">
      <span style="font-size:32px;color:${color};">${color === "#16a34a" ? "&#10003;" : color === "#dc2626" ? "&#10007;" : "&#9888;"}</span>
    </div>
    <h2 style="margin:0 0 8px;color:#1e293b;font-size:20px;">${title}</h2>
    <p style="margin:0;color:#64748b;font-size:14px;line-height:1.5;">${message}</p>
    <p style="margin:24px 0 0;font-size:12px;color:#94a3b8;">You can close this page.</p>
  </div>
</body>
</html>`;
}

export async function registerRoutes(app: Express): Promise<Server> {
  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  app.post("/api/leave/notify", async (req: Request, res: Response) => {
    try {
      const { requestId, userName, leaveType, fromDate, toDate, days, reason, approverEmails } = req.body;

      if (!requestId || !approverEmails || approverEmails.length === 0) {
        return res.status(400).json({ error: "Missing required fields" });
      }

      if (!resend) {
        return res.status(500).json({ error: "Email service not configured" });
      }

      const baseUrl = getBaseUrl(req);
      const approveToken = generateToken(requestId, "approve");
      const rejectToken = generateToken(requestId, "reject");

      const approveUrl = `${baseUrl}/api/leave/action?id=${requestId}&action=approve&token=${approveToken}`;
      const rejectUrl = `${baseUrl}/api/leave/action?id=${requestId}&action=reject&token=${rejectToken}`;

      const html = buildEmailHtml({
        userName: userName || "A team member",
        leaveType: leaveType || "Leave",
        fromDate: fromDate || "",
        toDate: toDate || "",
        days: days || 1,
        reason: reason || "No reason provided",
        approveUrl,
        rejectUrl,
      });

      const { error } = await resend.emails.send({
        from: "FieldTrack <onboarding@resend.dev>",
        to: approverEmails,
        subject: `Leave Request: ${leaveType} - ${userName || "Team Member"}`,
        html,
      });

      if (error) {
        console.error("Resend error:", error);
        return res.status(500).json({ error: "Failed to send email", details: error.message });
      }

      return res.json({ success: true, message: "Notification sent" });
    } catch (e: any) {
      console.error("Email notification error:", e);
      return res.status(500).json({ error: e.message || "Internal error" });
    }
  });

  app.get("/api/leave/action", async (req: Request, res: Response) => {
    try {
      const { id, action, token } = req.query as { id: string; action: string; token: string };

      if (!id || !action || !token) {
        return res.status(400).send(buildResultHtml("Invalid Link", "This link is missing required parameters.", "#f59e0b"));
      }

      if (action !== "approve" && action !== "reject") {
        return res.status(400).send(buildResultHtml("Invalid Action", "This link contains an invalid action.", "#f59e0b"));
      }

      if (!verifyToken(id, action, token)) {
        return res.status(403).send(buildResultHtml("Invalid Token", "This link has expired or is invalid. Please use the link from the original email.", "#dc2626"));
      }

      if (!supabaseServer) {
        return res.status(500).send(buildResultHtml("Server Error", "Database connection not configured.", "#dc2626"));
      }

      const { data, error } = await supabaseServer.rpc("process_leave_from_email", {
        p_request_id: id,
        p_action: action,
        p_approver: "Email Approver",
      });

      if (error) {
        console.error("Supabase RPC error:", error);
        return res.status(500).send(buildResultHtml("Error", "Failed to process request. The admin-migration.sql may need to be run in Supabase.", "#dc2626"));
      }

      const result = data as string;

      if (result === "APPROVED") {
        return res.send(buildResultHtml("Leave Approved", "The leave request has been approved successfully. The employee will be notified.", "#16a34a"));
      } else if (result === "REJECTED") {
        return res.send(buildResultHtml("Leave Rejected", "The leave request has been rejected. The employee will be notified.", "#dc2626"));
      } else if (result === "ALREADY_PROCESSED") {
        return res.send(buildResultHtml("Already Processed", "This leave request has already been approved or rejected.", "#f59e0b"));
      } else if (result === "NOT_FOUND") {
        return res.status(404).send(buildResultHtml("Not Found", "This leave request was not found.", "#f59e0b"));
      } else if (result === "INSUFFICIENT_BALANCE") {
        return res.status(400).send(buildResultHtml("Cannot Approve", "The employee does not have sufficient leave balance for this approval.", "#dc2626"));
      } else {
        return res.status(400).send(buildResultHtml("Error", "An unexpected error occurred: " + result, "#dc2626"));
      }
    } catch (e: any) {
      console.error("Leave action error:", e);
      return res.status(500).send(buildResultHtml("Server Error", "An internal error occurred. Please try again.", "#dc2626"));
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
