/**
 * ALEX IO Native Floating AI Chat Widget
 * Conectado directamente con la API REST de PuentesGlobales en Render
 */

(function () {
  // Evitar duplicación
  if (document.getElementById('alex-io-widget-container')) return;

  // Estilos del Widget
  const style = document.createElement('style');
  style.innerHTML = `
    .alex-widget-bubble {
      position: fixed;
      bottom: 25px;
      right: 25px;
      width: 60px;
      height: 60px;
      border-radius: 50%;
      background: linear-gradient(135deg, #6366f1, #4f46e5);
      box-shadow: 0 10px 25px rgba(99, 102, 241, 0.4);
      display: flex;
      align-items: center;
      justify-content: center;
      color: white;
      cursor: pointer;
      z-index: 9999;
      transition: transform 0.3s ease, box-shadow 0.3s ease;
    }
    .alex-widget-bubble:hover {
      transform: scale(1.08);
      box-shadow: 0 15px 30px rgba(99, 102, 241, 0.6);
    }
    .alex-widget-box {
      display: none;
      position: fixed;
      bottom: 95px;
      right: 25px;
      width: 360px;
      max-width: 90vw;
      height: 480px;
      background: #ffffff;
      border-radius: 20px;
      box-shadow: 0 20px 50px rgba(0,0,0,0.15);
      border: 1px solid #e2e8f0;
      z-index: 9999;
      flex-direction: column;
      overflow: hidden;
      font-family: 'Outfit', sans-serif;
    }
    .alex-header {
      background: linear-gradient(135deg, #6366f1, #4f46e5);
      color: white;
      padding: 1.2rem;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .alex-header h4 { margin: 0; font-size: 1.1rem; font-weight: 700; }
    .alex-header p { margin: 0; font-size: 0.8rem; opacity: 0.9; }
    .alex-body {
      flex: 1;
      padding: 1rem;
      overflow-y: auto;
      background: #f8fafc;
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
    }
    .alex-msg {
      padding: 0.85rem 1rem;
      border-radius: 14px;
      font-size: 0.9rem;
      line-height: 1.4;
      max-width: 85%;
    }
    .alex-msg-bot {
      background: #ffffff;
      color: #1e293b;
      border: 1px solid #e2e8f0;
      align-self: flex-start;
      border-bottom-left-radius: 4px;
    }
    .alex-msg-user {
      background: #6366f1;
      color: #ffffff;
      align-self: flex-end;
      border-bottom-right-radius: 4px;
    }
    .alex-footer {
      padding: 0.75rem 1rem;
      background: white;
      border-top: 1px solid #e2e8f0;
      display: flex;
      gap: 0.5rem;
    }
    .alex-footer input {
      flex: 1;
      border: 1px solid #cbd5e1;
      border-radius: 100px;
      padding: 0.6rem 1rem;
      font-size: 0.9rem;
      outline: none;
    }
    .alex-footer button {
      background: #6366f1;
      color: white;
      border: none;
      border-radius: 100px;
      padding: 0.6rem 1.25rem;
      font-weight: 600;
      cursor: pointer;
    }
  `;
  document.head.appendChild(style);

  // Crear HTML del Widget
  const container = document.createElement('div');
  container.id = 'alex-io-widget-container';
  container.innerHTML = `
    <div class="alex-widget-bubble" onclick="toggleAlexBox()">
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
    </div>

    <div class="alex-widget-box" id="alex-box">
      <div class="alex-header">
        <div>
          <h4>🤖 ALEX IO Assistant</h4>
          <p>Consultoría Migratoria & Empleo Europa</p>
        </div>
        <span onclick="toggleAlexBox()" style="cursor:pointer; font-size:1.2rem">&times;</span>
      </div>
      <div class="alex-body" id="alex-chat-body">
        <div class="alex-msg alex-msg-bot">¡Hola! 👋 Soy ALEX IO. ¿En qué te puedo ayudar sobre empleos, visados o relocalización en Europa?</div>
      </div>
      <div class="alex-footer">
        <input type="text" id="alex-input" placeholder="Escribe tu duda..." onkeypress="if(event.key==='Enter') sendAlexMsg()">
        <button onclick="sendAlexMsg()">Enviar</button>
      </div>
    </div>
  `;
  document.body.appendChild(container);
})();

function toggleAlexBox() {
  const box = document.getElementById('alex-box');
  box.style.display = (box.style.display === 'flex') ? 'none' : 'flex';
}

async function sendAlexMsg() {
  const input = document.getElementById('alex-input');
  const msg = input.value.trim();
  if (!msg) return;

  const body = document.getElementById('alex-chat-body');
  body.innerHTML += `<div class="alex-msg alex-msg-user">${msg}</div>`;
  input.value = '';
  body.scrollTop = body.scrollHeight;

  try {
    const apiBase = window.PG_CONFIG ? window.PG_CONFIG.API_BASE : '/api/v1';
    const res = await fetch(`${apiBase}/talkme/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: msg })
    });
    const data = await res.json();
    if (data.success && data.reply) {
      body.innerHTML += `<div class="alex-msg alex-msg-bot">${data.reply}</div>`;
    } else {
      body.innerHTML += `<div class="alex-msg alex-msg-bot">Respuesta recibida.</div>`;
    }
  } catch (err) {
    body.innerHTML += `<div class="alex-msg alex-msg-bot">Disculpa, hubo un problema de conexión temporal.</div>`;
  }
  body.scrollTop = body.scrollHeight;
}
