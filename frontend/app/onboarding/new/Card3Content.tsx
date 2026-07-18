"use client";

import {
  RadioCardGroup,
  SegmentedControl,
  SelectField,
  TextareaField,
  TextField,
} from "./formFields";
import s from "./cardContent.module.scss";
import type {
  Card3bSla,
  HelpdeskCredentials,
  SupportChatbotBrief,
} from "./briefTypes";

export interface Card3ContentProps {
  brief: SupportChatbotBrief;
  updateBrief: (
    updater: (prev: SupportChatbotBrief) => SupportChatbotBrief,
  ) => void;
}

// --------------------------------------------------------------------------- //
// Static option lists                                                         //
// --------------------------------------------------------------------------- //

const HELPDESK_PROVIDERS: Array<{
  kind: HelpdeskCredentials["kind"];
  label: string;
  description: string;
}> = [
  {
    kind: "zendesk",
    label: "Zendesk",
    description: "subdomain.zendesk.com + API token",
  },
  {
    kind: "freshdesk",
    label: "Freshdesk",
    description: "subdomain.freshdesk.com + API kulcs",
  },
  {
    kind: "hubspot",
    label: "HubSpot Service Hub",
    description: "Portal ID + Private App token",
  },
  {
    kind: "webhook",
    label: "Saját webhook",
    description: "POST endpoint + opcionális auth header",
  },
];

const FIRST_RESPONSE_OPTIONS: Array<{
  value: Card3bSla["first_response_time"];
  label: string;
}> = [
  { value: "1h", label: "1 órán belül" },
  { value: "4h", label: "4 órán belül" },
  { value: "24h", label: "1 munkanap" },
  { value: "48h", label: "2 munkanap" },
  { value: "72h", label: "3 munkanap" },
  { value: "case_by_case", label: "Esetenként" },
];

const RESOLUTION_OPTIONS: Array<{
  value: Card3bSla["resolution_time"];
  label: string;
}> = [
  { value: "24h", label: "1 munkanap" },
  { value: "48h", label: "2 munkanap" },
  { value: "72h", label: "3 munkanap" },
  { value: "5d", label: "5 munkanap" },
  { value: "7d", label: "7 munkanap" },
  { value: "case_by_case", label: "Esetenként" },
];

const URGENT_OPTIONS: Array<{
  value: Card3bSla["urgent_response"];
  label: string;
}> = [
  { value: "15min", label: "15 percen belül" },
  { value: "1h", label: "1 órán belül" },
  { value: "4h", label: "4 órán belül" },
  { value: "24h", label: "1 munkanap" },
  { value: "case_by_case", label: "Esetenként" },
];

// --------------------------------------------------------------------------- //
// Card 3 content                                                              //
// --------------------------------------------------------------------------- //

export default function Card3Content({ brief, updateBrief }: Card3ContentProps) {
  const c = brief.card3;

  const setHelpdesk = <K extends keyof typeof c.helpdesk>(
    key: K,
    value: (typeof c.helpdesk)[K],
  ) => {
    updateBrief((prev) => ({
      ...prev,
      card3: {
        ...prev.card3,
        helpdesk: { ...prev.card3.helpdesk, [key]: value },
      },
    }));
  };

  const setSla = <K extends keyof Card3bSla>(
    key: K,
    value: Card3bSla[K],
  ) => {
    updateBrief((prev) => ({
      ...prev,
      card3: { ...prev.card3, sla: { ...prev.card3.sla, [key]: value } },
    }));
  };

  return (
    <div className={s.cardForm}>
      <p className={s.intro}>
        Innen vezérelhetők a chatbot „kapcsolati pontjai”: ha van helpdesk-eszközöd,
        közvetlenül abba nyit jegyet; az SLA-számok pedig az ügyfél felé tett
        ígéretek, amelyeket a bot szóban is megerősít.
      </p>

      {/* ============================================================== */}
      {/* 3a Helpdesk integráció                                           */}
      {/* ============================================================== */}
      <div className={s.subsection}>
        <header className={s.subsectionHead}>
          <span className={s.subsectionTag}>3A</span>
          <div>
            <h3 className={s.subsectionTitle}>Helpdesk integráció</h3>
            <p className={s.subsectionSubtitle}>
              Ha van Zendesk / Freshdesk / HubSpot fiókod, a bot automatikusan
              jegyet nyit a vásárló ügyéhez.
            </p>
          </div>
        </header>

        <label className={s.toggleRow}>
          <input
            type="checkbox"
            checked={c.helpdesk.has_helpdesk}
            onChange={(e) => {
              setHelpdesk("has_helpdesk", e.target.checked);
              // Ha kikapcsolja, töröljük a credentialst is.
              if (!e.target.checked) {
                setHelpdesk("credentials", null);
              }
            }}
          />
          <span className={s.toggleRowText}>
            <span className={s.toggleRowLabel}>Van helpdesk eszközünk</span>
            <span className={s.toggleRowDesc}>
              Ha nincs, a bot az emailcímre / űrlapra továbbít.
            </span>
          </span>
        </label>

        {c.helpdesk.has_helpdesk && (
          <>
            <RadioCardGroup
              label="Helpdesk szolgáltató"
              value={c.helpdesk.credentials?.kind ?? "zendesk"}
              onChange={(kind) => {
                // Új credentials objektum az új kind-hoz (üres mezőkkel).
                setHelpdesk("credentials", emptyCredentialsFor(kind));
              }}
              options={HELPDESK_PROVIDERS.map((p) => ({
                value: p.kind,
                label: p.label,
                description: p.description,
              }))}
              required
            />

            <HelpdeskCredentialFields
              credentials={c.helpdesk.credentials ?? null}
              onChange={(next) => setHelpdesk("credentials", next)}
            />

            <TextareaField
              label="Jegy-továbbítási megjegyzés (opcionális)"
              value={c.helpdesk.ticket_routing_notes ?? ""}
              onChange={(v) =>
                setHelpdesk(
                  "ticket_routing_notes",
                  v.trim() === "" ? null : v,
                )
              }
              placeholder="pl. 'reklamációk a Tier-2 csoporthoz, garanciás ügyek a Service csoporthoz'"
              hint="A bot ezt a megjegyzést mellékeli minden nyitott jegyhez."
              rows={3}
            />
          </>
        )}
      </div>

      {/* ============================================================== */}
      {/* 3b SLA                                                           */}
      {/* ============================================================== */}
      <div className={s.subsection}>
        <header className={s.subsectionHead}>
          <span className={s.subsectionTag}>3B</span>
          <div>
            <h3 className={s.subsectionTitle}>SLA — ügyfél felé tett ígéretek</h3>
            <p className={s.subsectionSubtitle}>
              A bot ezeket az értékeket idézi: „X órán belül válaszolunk”,
              „Y nap a megoldás”.
            </p>
          </div>
        </header>

        <div className={s.row}>
          <SelectField
            label="Első válasz időablaka"
            value={c.sla.first_response_time}
            onChange={(v) => setSla("first_response_time", v)}
            options={FIRST_RESPONSE_OPTIONS}
            fullWidth={false}
            hint="Mennyi időn belül kap a vásárló bármilyen választ."
          />
          <SelectField
            label="Megoldási időablak"
            value={c.sla.resolution_time}
            onChange={(v) => setSla("resolution_time", v)}
            options={RESOLUTION_OPTIONS}
            fullWidth={false}
            hint="Mennyi idő alatt zárjátok le tipikusan az ügyet."
          />
        </div>

        <SelectField
          label="Sürgős esetek válaszideje"
          value={c.sla.urgent_response}
          onChange={(v) => setSla("urgent_response", v)}
          options={URGENT_OPTIONS}
          hint="Sürgős vagy eszkalált ügyekre vonatkozó válaszidő-ígéret."
        />
      </div>

    </div>
  );
}

// --------------------------------------------------------------------------- //
// Helpdesk credential subcomponent                                            //
// --------------------------------------------------------------------------- //

function emptyCredentialsFor(
  kind: HelpdeskCredentials["kind"],
): HelpdeskCredentials {
  switch (kind) {
    case "zendesk":
      return { kind: "zendesk", subdomain: "", api_token: null };
    case "freshdesk":
      return { kind: "freshdesk", subdomain: "", api_key: null };
    case "hubspot":
      return { kind: "hubspot", portal_id: "", api_token: null };
    case "webhook":
      return { kind: "webhook", url: "", auth_header: null };
  }
}

interface HelpdeskCredentialFieldsProps {
  credentials: HelpdeskCredentials | null;
  onChange: (next: HelpdeskCredentials) => void;
}

function HelpdeskCredentialFields({
  credentials,
  onChange,
}: HelpdeskCredentialFieldsProps) {
  if (!credentials) return null;

  switch (credentials.kind) {
    case "zendesk":
      return (
        <div className={s.row}>
          <TextField
            label="Zendesk subdomain"
            value={credentials.subdomain}
            onChange={(v) => onChange({ ...credentials, subdomain: v })}
            placeholder="acme"
            required
            fullWidth={false}
            hint="Csak a subdomain, nem a teljes URL (pl. „acme”, nem „acme.zendesk.com”)."
          />
          <TextField
            label="API token (opcionális most)"
            value={credentials.api_token ?? ""}
            onChange={(v) =>
              onChange({
                ...credentials,
                api_token: v.trim() === "" ? null : v,
              })
            }
            placeholder="később is megadható a beállításokban"
            type="password"
            fullWidth={false}
            autoComplete="off"
          />
        </div>
      );
    case "freshdesk":
      return (
        <div className={s.row}>
          <TextField
            label="Freshdesk subdomain"
            value={credentials.subdomain}
            onChange={(v) => onChange({ ...credentials, subdomain: v })}
            placeholder="acme"
            required
            fullWidth={false}
            hint="Az 'acme.freshdesk.com'-ban az 'acme' rész."
          />
          <TextField
            label="API kulcs (opcionális most)"
            value={credentials.api_key ?? ""}
            onChange={(v) =>
              onChange({
                ...credentials,
                api_key: v.trim() === "" ? null : v,
              })
            }
            placeholder="később is megadható"
            type="password"
            fullWidth={false}
            autoComplete="off"
          />
        </div>
      );
    case "hubspot":
      return (
        <div className={s.row}>
          <TextField
            label="HubSpot Portal ID"
            value={credentials.portal_id}
            onChange={(v) => onChange({ ...credentials, portal_id: v })}
            placeholder="pl. 12345678"
            required
            fullWidth={false}
            hint="A HubSpot URL-jében szerepel."
          />
          <TextField
            label="Private App token (opcionális most)"
            value={credentials.api_token ?? ""}
            onChange={(v) =>
              onChange({
                ...credentials,
                api_token: v.trim() === "" ? null : v,
              })
            }
            placeholder="pat-eu1-..."
            type="password"
            fullWidth={false}
            autoComplete="off"
          />
        </div>
      );
    case "webhook":
      return (
        <>
          <TextField
            label="Webhook URL"
            value={credentials.url}
            onChange={(v) => onChange({ ...credentials, url: v })}
            placeholder="https://api.example.com/tickets"
            type="url"
            required
            hint="A bot POST hívást küld ide minden új jegy-eseménynél."
          />
          <TextField
            label="Auth header érték (opcionális)"
            value={credentials.auth_header ?? ""}
            onChange={(v) =>
              onChange({
                ...credentials,
                auth_header: v.trim() === "" ? null : v,
              })
            }
            placeholder="pl. Bearer eyJhbGciOi..."
            type="password"
            autoComplete="off"
            hint="Ha a webhook authentikációt vár, ezt küldjük az 'Authorization' headerben."
          />
        </>
      );
  }
}
