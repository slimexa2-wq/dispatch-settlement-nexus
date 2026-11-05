/**
 * AI 助手聊天界面组件
 */
import { App, Avatar, Button, Empty, Input, List, Spin, Tag, Typography } from "antd";
import { SendOutlined, RobotOutlined, UserOutlined, CheckCircleOutlined, QuestionCircleOutlined } from "@ant-design/icons";
import { useEffect, useRef, useState } from "react";
import type { AiChatMessage, AiAction } from "../lib/ai-assistant";

const { Text } = Typography;

interface AiChatProps {
  messages: AiChatMessage[];
  onSendMessage: (message: string) => Promise<void>;
  onConfirmAction: (action: AiAction | null) => Promise<void>;
  loading: boolean;
  pendingAction?: AiAction | null;
}

export function AiChat({ messages, onSendMessage, onConfirmAction, loading, pendingAction }: AiChatProps) {
  const { message } = App.useApp();
  const [inputValue, setInputValue] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, loading]);

  const handleSend = async () => {
    const text = inputValue.trim();
    if (!text) {
      message.warning("请输入内容");
      return;
    }
    setInputValue("");
    await onSendMessage(text);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  };

  const quickQuestions = [
    { label: "今日面试人数", text: "今日面试人数" },
    { label: "当前在职人数", text: "当前在职人数" },
    { label: "项目入职数据", text: "四川时代项目1-6月入职数据" },
    { label: "登记离职", text: "张三今天离职，原因是清退临时工" }
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 220px)", minHeight: 400 }}>
      {/* 消息列表 */}
      <div style={{ flex: 1, overflowY: "auto", padding: "16px 0", marginBottom: 12 }}>
        {messages.length === 0 ? (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={
              <div>
                <Text strong>AI 助手已就绪</Text>
                <br />
                <Text type="secondary" style={{ fontSize: 12 }}>可以帮您查询数据、登记操作</Text>
              </div>
            }
          />
        ) : (
          <List
            dataSource={messages}
            renderItem={(msg) => (
              <div
                key={msg.timestamp + msg.role}
                style={{
                  display: "flex",
                  marginBottom: 12,
                  justifyContent: msg.role === "user" ? "flex-end" : "flex-start"
                }}
              >
                {msg.role === "assistant" && (
                  <Avatar icon={<RobotOutlined />} style={{ backgroundColor: "#1677ff", marginRight: 8, flexShrink: 0 }} />
                )}
                <div
                  style={{
                    maxWidth: "70%",
                    padding: "10px 14px",
                    borderRadius: 14,
                    background: msg.role === "user" ? "#1677ff" : "#f0f2f5",
                    color: msg.role === "user" ? "#fff" : "inherit",
                    wordBreak: "break-word",
                    whiteSpace: "pre-wrap"
                  }}
                >
                  {msg.content}
                </div>
                {msg.role === "user" && (
                  <Avatar icon={<UserOutlined />} style={{ backgroundColor: "#87d068", marginLeft: 8, flexShrink: 0 }} />
                )}
              </div>
            )}
          />
        )}
        {loading && (
          <div style={{ display: "flex", alignItems: "center", marginBottom: 12 }}>
            <Avatar icon={<RobotOutlined />} style={{ backgroundColor: "#1677ff", marginRight: 8 }} />
            <Spin size="small" />
            <Text type="secondary" style={{ marginLeft: 8 }}>思考中…</Text>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* 快捷问题 */}
      <div style={{ marginBottom: 12 }}>
        <Text type="secondary" style={{ fontSize: 12, display: "block", marginBottom: 6 }}>
          快捷提问：
        </Text>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {quickQuestions.map((q) => (
            <Tag
              key={q.label}
              style={{ cursor: "pointer" }}
              onClick={() => setInputValue(q.text)}
              color={q.label === "登记离职" ? "orange" : "blue"}
            >
              {q.label}
            </Tag>
          ))}
        </div>
      </div>

      {/* 待确认操作 */}
      {pendingAction && (
        <div style={{ marginBottom: 12, padding: 10, background: "#fff7e6", borderRadius: 8, border: "1px solid #ffd591" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center" }}>
              <QuestionCircleOutlined style={{ color: "#fa8c16", marginRight: 6 }} />
              <Text strong style={{ fontSize: 13 }}>待确认操作</Text>
            </div>
            <div>
              <Button
                size="small"
                type="primary"
                icon={<CheckCircleOutlined />}
                onClick={() => void onConfirmAction(pendingAction)}
                style={{ marginRight: 6 }}
              >
                确认执行
              </Button>
              <Button
                size="small"
                onClick={() => void onConfirmAction(null)}
              >
                取消
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* 输入框 */}
      <div style={{ display: "flex", gap: 8 }}>
        <Input.TextArea
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyPress={handleKeyPress}
          placeholder="输入指令，如：张三今天离职，原因是清退临时工"
          autoSize={{ minRows: 1, maxRows: 4 }}
          style={{ borderRadius: 20, paddingRight: 50 }}
        />
        <Button
          type="primary"
          icon={<SendOutlined />}
          onClick={() => void handleSend()}
          disabled={!inputValue.trim() || loading}
          style={{ borderRadius: 20, width: 40, height: 40 }}
        />
      </div>
    </div>
  );
}
