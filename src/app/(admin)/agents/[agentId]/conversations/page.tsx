"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/layout/page-header";
import { ArrowLeft, MessageSquare, X } from "lucide-react";
import type { Conversation, Message } from "@/types/database";
import Link from "next/link";

export default function AgentConversationsPage() {
  const params = useParams();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [selectedConv, setSelectedConv] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/conversations?agentId=${params.agentId}`)
      .then((r) => r.json())
      .then(setConversations)
      .finally(() => setLoading(false));
  }, [params.agentId]);

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
      <PageHeader
        title="Conversations"
        description="View conversation history"
        action={
          <Link href="/agents">
            <Button variant="outline">
              <ArrowLeft className="h-4 w-4 mr-1" />
              Back
            </Button>
          </Link>
        }
      />

      <div className="grid gap-4 md:grid-cols-3">
        {/* Conversation List */}
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
                  <Badge variant={conv.is_active ? "success" : "secondary"} className="text-xs">
                    {conv.is_active ? "Active" : "Closed"}
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
              No conversations yet
            </div>
          )}
        </div>

        {/* Message Thread */}
        <div className="md:col-span-2">
          {selectedConv ? (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between py-3">
                <CardTitle className="text-lg flex items-center gap-2">
                  <MessageSquare className="h-4 w-4" />
                  Conversation
                </CardTitle>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    setSelectedConv(null);
                    setMessages([]);
                  }}
                >
                  <X className="h-4 w-4" />
                </Button>
              </CardHeader>
              <CardContent className="max-h-[600px] overflow-y-auto space-y-3">
                {messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`max-w-[80%] rounded-lg p-3 text-sm ${
                        msg.role === "user"
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted"
                      }`}
                    >
                      <p className="whitespace-pre-wrap">{msg.content}</p>
                      <div className={`text-xs mt-1 ${msg.role === "user" ? "opacity-70" : "text-muted-foreground"}`}>
                        {new Date(msg.created_at).toLocaleTimeString()}
                      </div>
                    </div>
                  </div>
                ))}
                {messages.length === 0 && (
                  <div className="text-center py-12 text-muted-foreground text-sm">
                    No messages in this conversation
                  </div>
                )}
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
