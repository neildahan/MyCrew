// WhatsApp Cloud API webhook payload types
export interface WhatsAppWebhookPayload {
  object: string;
  entry: WhatsAppEntry[];
}

export interface WhatsAppEntry {
  id: string;
  changes: WhatsAppChange[];
}

export interface WhatsAppChange {
  value: {
    messaging_product: string;
    metadata: {
      display_phone_number: string;
      phone_number_id: string;
    };
    contacts?: WhatsAppContact[];
    messages?: WhatsAppIncomingMessage[];
    statuses?: WhatsAppStatus[];
  };
  field: string;
}

export interface WhatsAppContact {
  profile: { name: string };
  wa_id: string;
}

export interface WhatsAppIncomingMessage {
  from: string;
  id: string;
  timestamp: string;
  type: "text" | "image" | "interactive" | "button";
  text?: { body: string };
  interactive?: {
    type: string;
    button_reply?: { id: string; title: string };
    list_reply?: { id: string; title: string; description: string };
  };
}

export interface WhatsAppStatus {
  id: string;
  status: "sent" | "delivered" | "read" | "failed";
  timestamp: string;
  recipient_id: string;
}

// Outgoing message types
export interface WhatsAppTextMessage {
  messaging_product: "whatsapp";
  to: string;
  type: "text";
  text: { body: string };
}

export interface WhatsAppInteractiveMessage {
  messaging_product: "whatsapp";
  to: string;
  type: "interactive";
  interactive: {
    type: "button" | "list";
    header?: { type: "text"; text: string };
    body: { text: string };
    footer?: { text: string };
    action: WhatsAppInteractiveAction;
  };
}

export interface WhatsAppInteractiveAction {
  buttons?: Array<{
    type: "reply";
    reply: { id: string; title: string };
  }>;
  button?: string;
  sections?: Array<{
    title: string;
    rows: Array<{
      id: string;
      title: string;
      description?: string;
    }>;
  }>;
}
