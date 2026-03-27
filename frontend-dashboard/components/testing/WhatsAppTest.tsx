import React, { useEffect, useState } from 'react';
import io from 'socket.io-client';
import { API_URL } from "../../config/apiConfig";

const SOCKET_URL = API_URL.replace(/\/api\/?$/, "");
const socket = io(SOCKET_URL);

const WhatsAppTest = () => {
  const [messages, setMessages] = useState<any[]>([]);

  useEffect(() => {
    socket.on("whatsapp_message", (data) => {
      setMessages((prev) => [data, ...prev]);
    });

    return () => { socket.off("whatsapp_message"); };
  }, []);

  return (
    <div style={{ padding: '20px', fontFamily: 'sans-serif' }}>
      <h2>Iterra Studio Testing Platform</h2>
      <div style={{ border: '1px solid #ccc', height: '400px', overflowY: 'scroll', padding: '10px' }}>
        {messages.length === 0 && <p>Waiting for messages...</p>}
        {messages.map((m, i) => (
          <div key={i} style={{ marginBottom: '10px', padding: '8px', background: '#f0f0f0', borderRadius: '5px' }}>
            <strong>{m.from}:</strong> {m.text}
            <div style={{ fontSize: '10px', color: '#888' }}>{m.timestamp}</div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default WhatsAppTest;
