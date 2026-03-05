import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from loguru import logger

from config import settings
from db.models import AlertEvent
from concurrent.futures import ThreadPoolExecutor


# Thread pool for blocking SMTP calls
_email_executor = ThreadPoolExecutor(max_workers=1)


def _build_email_html(events: list[AlertEvent]) -> str:
    """Build an HTML email body for breach alerts."""
    rows_html = ""
    for e in events:
        try:
            service_name = e.service.name
        except Exception:
            service_name = f"service_id={e.service_id}"

        badge_color = {
            "absolute": "#dc2626",
            "statistical": "#d97706",
            "percentage": "#7c3aed",
        }.get(e.winning_component, "#6b7280")

        def _component_cell(
            label: str, value: float | None, color: str, winning: str
        ) -> str:
            if value is None:
                return """<td style="padding:4px 8px;text-align:center">
                    <span style="font-size:11px;color:#94a3b8">—</span>
                </td>"""
            is_winner = label.lower() == winning.lower()
            border = f"2px solid {color}" if is_winner else "1px solid #e2e8f0"
            weight = "700" if is_winner else "400"
            return f"""<td style="padding:4px 8px;text-align:center">
                <span style="display:inline-block;background:{"#fff"};border:{border};
                             color:{color};border-radius:4px;padding:2px 8px;
                             font-size:11px;font-weight:{weight}">
                    ${value:,.2f}
                </span>
            </td>"""

        abs_cell = _component_cell(
            "absolute",
            float(e.absolute_component) if e.absolute_component is not None else None,
            "#dc2626",
            e.winning_component,
        )
        stat_cell = _component_cell(
            "statistical",
            float(e.statistical_component)
            if e.statistical_component is not None
            else None,
            "#d97706",
            e.winning_component,
        )
        pct_cell = _component_cell(
            "percentage",
            float(e.percentage_component)
            if e.percentage_component is not None
            else None,
            "#7c3aed",
            e.winning_component,
        )

        rows_html += f"""
        <tr style="border-bottom:1px solid #f1f5f9">
            <td style="padding:12px 12px 4px">{service_name}</td>
            <td style="padding:12px 12px 4px;text-align:center">{e.period_type.value.capitalize()}</td>
            <td style="padding:12px 12px 4px;text-align:center">{e.reference_date}</td>
            <td style="padding:12px 12px 4px;text-align:right;color:#dc2626;font-weight:600">
                ${float(e.current_cost):,.2f}
            </td>
            <td style="padding:12px 12px 4px;text-align:right">${float(e.computed_threshold):,.2f}</td>
            <td style="padding:12px 12px 4px;text-align:center">
                <span style="background:{badge_color};color:#fff;padding:2px 8px;
                             border-radius:4px;font-size:12px;font-weight:600">
                    {e.winning_component}
                </span>
            </td>
        </tr>
        <tr style="background:#f8fafc;border-bottom:2px solid #e2e8f0">
            <td colspan="3" style="padding:4px 12px 10px;font-size:11px;color:#94a3b8;
                                   font-style:italic">
                Threshold components evaluated:
            </td>
            <td colspan="3" style="padding:4px 12px 10px">
                <table width="100%" cellpadding="0" cellspacing="0">
                    <tr>
                        <td style="font-size:11px;color:#dc2626;text-align:center;
                                   padding-bottom:2px;font-weight:600">Absolute</td>
                        <td style="font-size:11px;color:#d97706;text-align:center;
                                   padding-bottom:2px;font-weight:600">Statistical</td>
                        <td style="font-size:11px;color:#7c3aed;text-align:center;
                                   padding-bottom:2px;font-weight:600">Percentage</td>
                    </tr>
                    <tr>
                        {abs_cell}
                        {stat_cell}
                        {pct_cell}
                    </tr>
                </table>
            </td>
        </tr>"""

    count = len(events)
    return f"""<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,Helvetica,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:32px 0">
    <tr><td align="center">
      <table width="620" cellpadding="0" cellspacing="0"
             style="background:#ffffff;border-radius:8px;overflow:hidden;
                    box-shadow:0 1px 3px rgba(0,0,0,.1)">

        <!-- Header -->
        <tr>
          <td style="background:#1e3a5f;padding:28px 32px">
            <p style="margin:0;font-size:13px;color:#93c5fd;letter-spacing:1px;
                      text-transform:uppercase">Azure Cost Analyzer</p>
            <h1 style="margin:6px 0 0;font-size:22px;color:#ffffff">
              ⚠️ Cost Threshold Breach
            </h1>
          </td>
        </tr>

        <!-- Summary banner -->
        <tr>
          <td style="background:#fef2f2;border-left:4px solid #dc2626;
                     padding:14px 32px">
            <p style="margin:0;color:#991b1b;font-size:14px">
              <strong>{count} service{"s" if count > 1 else ""}</strong>
              {"have" if count > 1 else "has"} exceeded the configured cost threshold
              and require{"s" if count == 1 else ""} your attention.
            </p>
          </td>
        </tr>

        <!-- Table -->
        <tr>
          <td style="padding:24px 32px">
            <table width="100%" cellpadding="0" cellspacing="0"
                   style="border-collapse:collapse;font-size:13px">
              <thead>
                <tr style="background:#f8fafc">
                  <th style="padding:10px 12px;text-align:left;border-bottom:2px solid #e2e8f0;
                             color:#475569;font-weight:600;white-space:nowrap">Service</th>
                  <th style="padding:10px 12px;text-align:center;border-bottom:2px solid #e2e8f0;
                             color:#475569;font-weight:600">Period</th>
                  <th style="padding:10px 12px;text-align:center;border-bottom:2px solid #e2e8f0;
                             color:#475569;font-weight:600">Date</th>
                  <th style="padding:10px 12px;text-align:right;border-bottom:2px solid #e2e8f0;
                             color:#475569;font-weight:600">Current Cost</th>
                  <th style="padding:10px 12px;text-align:right;border-bottom:2px solid #e2e8f0;
                             color:#475569;font-weight:600">Threshold</th>
                  <th style="padding:10px 12px;text-align:center;border-bottom:2px solid #e2e8f0;
                             color:#475569;font-weight:600">Rule</th>
                </tr>
              </thead>
              <tbody>
                {rows_html}
              </tbody>
            </table>
          </td>
        </tr>

       <!-- Rule legend -->
        <tr>
          <td style="padding:0 32px 20px">
            <p style="margin:0 0 10px;font-size:12px;color:#64748b;font-weight:600;
                      letter-spacing:.5px;text-transform:uppercase">
              Why was this alert triggered?
            </p>
            <table cellpadding="0" cellspacing="0" width="100%">
              <tr>
                <td style="padding:6px 0;vertical-align:top;width:90px">
                  <span style="background:#dc2626;color:#fff;padding:2px 8px;
                               border-radius:4px;font-size:11px;font-weight:600">
                    absolute
                  </span>
                </td>
                <td style="padding:6px 0;font-size:12px;color:#475569;line-height:1.5">
                  The cost exceeded the fixed budget limit you manually set for this service.
                </td>
              </tr>
              <tr>
                <td style="padding:6px 0;vertical-align:top">
                  <span style="background:#d97706;color:#fff;padding:2px 8px;
                               border-radius:4px;font-size:11px;font-weight:600">
                    statistical
                  </span>
                </td>
                <td style="padding:6px 0;font-size:12px;color:#475569;line-height:1.5">
                  The cost is unusually high compared to recent spending patterns for this service.
                </td>
              </tr>
              <tr>
                <td style="padding:6px 0;vertical-align:top">
                  <span style="background:#7c3aed;color:#fff;padding:2px 8px;
                               border-radius:4px;font-size:11px;font-weight:600">
                    percentage
                  </span>
                </td>
                <td style="padding:6px 0;font-size:12px;color:#475569;line-height:1.5">
                  The cost has grown significantly beyond the average spend for this service.
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background:#f8fafc;border-top:1px solid #e2e8f0;
                     padding:20px 32px;text-align:center">
            <p style="margin:0;font-size:12px;color:#94a3b8">
              Acknowledge these alerts to allow new alerts for the same service.
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>"""


def _build_email_plain(events: list[AlertEvent]) -> str:
    """Plain text fallback for email clients that don't render HTML."""
    lines = [
        "AZURE COST ANALYZER — COST THRESHOLD BREACH",
        "=" * 60,
        "",
        f"{len(events)} service(s) have exceeded their cost threshold.",
        "",
        f"{'Service':<28} {'Period':<8} {'Date':<12} {'Cost':>10} {'Threshold':>10} {'Rule':<12}",
        "-" * 75,
    ]
    for e in events:
        try:
            service_name = e.service.name
        except Exception:
            service_name = f"service_id={e.service_id}"
        lines.append(
            f"{service_name:<28} {e.period_type.value:<8} {str(e.reference_date):<12} "
            f"${float(e.current_cost):>9.2f} ${float(e.computed_threshold):>9.2f} "
            f"{e.winning_component:<12}"
        )
    lines += [
        "",
        "To acknowledge: POST /alerts/events/{id}/acknowledge",
    ]
    return "\n".join(lines)


def _send_alert_email_sync(events: list[AlertEvent]) -> None:
    """Synchronous email sender — called via run_in_executor to avoid blocking."""
    if not events:
        return

    email_from: str = settings.ALERT_EMAIL_FROM or ""
    smtp_host: str = settings.SMTP_HOST or ""
    smtp_user: str = settings.SMTP_USER or ""
    smtp_password: str = settings.SMTP_PASSWORD or ""
    count = len(events)

    msg = MIMEMultipart("alternative")
    msg["Subject"] = (
        f"[Azure Cost Analyzer] ⚠️ {count} cost threshold breach{'es' if count > 1 else ''}"
    )
    msg["From"] = email_from
    msg["To"] = ", ".join(settings.alert_email_recipients)

    # Plain text first, HTML second — email clients prefer the last part
    msg.attach(MIMEText(_build_email_plain(events), "plain"))
    msg.attach(MIMEText(_build_email_html(events), "html"))

    with smtplib.SMTP(smtp_host, settings.SMTP_PORT) as smtp:
        smtp.ehlo()
        smtp.starttls()
        smtp.login(smtp_user, smtp_password)
        smtp.sendmail(email_from, settings.alert_email_recipients, msg.as_string())

    logger.info(
        f"Alert email sent to {settings.alert_email_recipients} for {count} event(s)."
    )


def shutdown_email_executor() -> None:
    """Gracefully shut down the email thread pool during app shutdown."""
    _email_executor.shutdown(wait=True)
