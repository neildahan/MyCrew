"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/layout/page-header";
import { MessageSquare, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Message } from "@/types/database";

interface ConversationWithAgent {
  id: string;
  whatsapp_user_id: string;
  whatsapp_user_name: string | null;
  last_message_at: string;
  is_active: boolean;
  agents: { name: string; slug: string } | null;
}

export default function AllConversationsPage() {
  const [conversations, setConversations] = useState<ConversationWithAgent[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [selectedConv, setSelectedConv] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/conversations")
      .then((r) => r.json())
      .then(setConversations)
      .finally(() => setLoading(false));
  }, []);

  async function loadMessages(convId: string) {
    setSelectedConv(convId);
    const res = await fetch(`/api/conversations/${convId}/messages`);
    setMessages(await res.json());
  }

  if (loading) {
    return <div className="flex items-center justify-center h-64 text-muted-foreground">Loading...</div>;
  }

  return (
    <div>
      <PageHeader title="All Conversations" description="View all agent conversations" />

      <div className="grid gap-4 md:grid-cols-3">
        <div className="space-y-2">
          {conversations.map((conv) => (
            <Card
              key={conv.id}
              className={`cursor-pointer transition-colors ${
                selectedConv === conv.id ? "border-primary" : "hover:border-primary/50"
              }`}
              onClick={() => loadMessages(conv.id)}
            >
              <CardContent className="p-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">
                    {conv.whatsapp_user_name ?? conv.whatsapp_user_id}
                  </span>
                  <Badge variant="outline" className="text-xs">
                    {conv.agents?.name ?? "Unknown"}
                  </Badge>
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  {new Date(conv.last_message_at).toLocaleString()}
                </div>
              </CardContent>
            </Card>
          ))}
          {conversations.length === 0 && (
            <div className="text-center py-12 text-muted-foreground text-sm">
              No conversations yet. Start chatting on WhatsApp!
            </div>
          )}
        </div>

        <div className="md:col-span-2">
          {selectedConv ? (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between py-3">
                <CardTitle className="text-lg flex items-center gap-2">
                  <MessageSquare className="h-4 w-4" />
                  Messages
                </CardTitle>
                <Button variant="ghost" size="icon" onClick={() => { setSelectedConv(null); setMessages([]); }}>
                  <X className="h-4 w-4" />
                </Button>
              </CardHeader>
              <CardContent className="max-h-[600px] overflow-y-auto space-y-3">
                {messages.map((msg) => (
                  <div key={msg.id} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[80%] rounded-lg p-3 text-sm ${msg.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
                      <p className="whitespace-pre-wrap">{msg.content}</p>
                      <div className={`text-xs mt-1 ${msg.role === "user" ? "opacity-70" : "text-muted-foreground"}`}>
                        {new Date(msg.created_at).toLocaleTimeString()}
                      </div>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          ) : (
            <div className="flex items-center justify-center h-64 text-muted-foreground text-sm">
              Select a conversation to view messages
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
