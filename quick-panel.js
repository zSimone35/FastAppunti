(() => {
  "use strict";

  const root = document.querySelector("#quickPanelApp");
  const token = document.documentElement.dataset.panelToken;
  const mode = document.documentElement.dataset.panelMode;
  const expectedOrigin = document.documentElement.dataset.openerOrigin;
  const state = { notes: [], templates: [], tab: document.documentElement.dataset.defaultTab || "notes", query: "" };
  const pending = new Map();
  let port = null;
  let requestNumber = 0;
  let currentNoteId = "";
  let currentTemplateId = "";
  let currentOutput = "";
  let previewTimer = null;
  let previewVersion = 0;

  const iconUrl = document.querySelector('link[rel="icon"]')?.href || "";
  root.innerHTML = `
    <div class="quick-panel-shell">
      <header class="quick-panel-header">
        <img src="${iconUrl}" alt="" />
        <div class="quick-panel-heading">
          <strong>Pannello rapido</strong>
          <small>${mode === "pip" ? "Sempre in primo piano · spostabile" : "Finestra normale · spostabile"}</small>
        </div>
        <button class="btn" id="quickReturn" type="button">Torna</button>
      </header>
      <nav class="quick-panel-tabs" role="tablist" aria-label="Archivi">
        <button class="quick-panel-tab" type="button" role="tab" aria-controls="quickList" data-quick-tab="notes">FastAppunti (<span id="quickNotesCount">0</span>)</button>
        <button class="quick-panel-tab" type="button" role="tab" aria-controls="quickList" data-quick-tab="plus">Appunti Plus (<span id="quickPlusCount">0</span>)</button>
      </nav>
      <div class="quick-panel-search">
        <label class="sr-only" for="quickSearch">Cerca</label>
        <input class="field" id="quickSearch" type="search" placeholder="Cerca appunti" autocomplete="off" />
      </div>
      <section class="quick-panel-list" id="quickList" aria-live="polite"></section>
      <div class="quick-panel-status" id="quickStatus" aria-live="polite"></div>
      <footer class="quick-panel-note">${mode === "pip" ? "Il vero PiP resta sopra alle altre finestre." : "Questo browser usa una finestra normale: il PiP video non può mostrare appunti HTML né restare sempre sopra."}</footer>
    </div>

    <dialog class="quick-dialog" id="quickNoteDialog">
      <form class="quick-dialog-form" id="quickNoteForm">
        <h2>Modifica appunto</h2>
        <div class="form-row"><label for="quickNoteTitle">Titolo</label><input class="field" id="quickNoteTitle" maxlength="120" required /></div>
        <div class="form-row"><label for="quickNoteText">Testo</label><textarea class="field" id="quickNoteText" required></textarea></div>
        <div class="form-row"><label for="quickNoteTags">Tag</label><input class="field" id="quickNoteTags" placeholder="lavoro, personale" /><small>Separa i tag con una virgola.</small></div>
        <div class="quick-plus-errors" id="quickNoteErrors" role="alert"></div>
        <div class="quick-dialog-actions">
          <button class="btn" type="button" data-close-dialog="quickNoteDialog">Annulla</button>
          <button class="btn primary" type="submit">Salva</button>
        </div>
      </form>
    </dialog>

    <dialog class="quick-dialog" id="quickPlusDialog">
      <form class="quick-dialog-form" id="quickPlusForm">
        <h2 id="quickPlusTitle">Compila modello</h2>
        <div class="quick-plus-fields" id="quickPlusFields"></div>
        <div class="quick-plus-errors" id="quickPlusErrors" role="alert"></div>
        <pre class="plus-preview quick-plus-preview" id="quickPlusPreview" aria-live="polite"></pre>
        <div class="quick-dialog-actions">
          <button class="btn" type="button" data-close-dialog="quickPlusDialog">Annulla</button>
          <button class="btn danger" id="quickPlusClear" type="button">Cancella</button>
          <button class="btn copy" id="quickPlusCopy" type="button" disabled>Copia</button>
          <button class="btn primary" type="submit">Salva valori</button>
        </div>
      </form>
    </dialog>
  `;

  const $ = selector => document.querySelector(selector);
  const list = $("#quickList");
  const status = $("#quickStatus");
  const noteDialog = $("#quickNoteDialog");
  const plusDialog = $("#quickPlusDialog");

  function showStatus(message, tone = "") {
    status.textContent = message;
    status.className = `quick-panel-status${tone ? ` ${tone}` : ""}`;
    clearTimeout(showStatus.timer);
    if (message) showStatus.timer = setTimeout(() => showStatus(""), tone === "error" ? 7000 : 2400);
  }

  function request(type, payload = {}) {
    if (!port) return Promise.reject(new Error("Collegamento con FastAppunti non disponibile."));
    const requestId = `${Date.now()}-${++requestNumber}`;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(requestId);
        reject(new Error("FastAppunti non ha risposto."));
      }, 8000);
      pending.set(requestId, { resolve, reject, timer });
      port.postMessage({ type, requestId, ...payload });
    });
  }

  function searchable(item) {
    return [item.title, item.text || item.template, ...(item.tags || [])].join(" ").toLowerCase();
  }

  function addTag(container, text) {
    const tag = document.createElement("span");
    tag.className = "tag";
    tag.textContent = text;
    container.appendChild(tag);
  }

  function addButton(container, label, action, id, primary = false) {
    const button = document.createElement("button");
    button.className = `btn${primary ? " primary" : ""}`;
    button.type = "button";
    button.dataset.quickAction = action;
    button.dataset.id = id;
    button.textContent = label;
    container.appendChild(button);
    return button;
  }

  function render() {
    document.body.classList.toggle("plus-active", state.tab === "plus");
    $("#quickNotesCount").textContent = state.notes.length;
    $("#quickPlusCount").textContent = state.templates.length;
    document.querySelectorAll("[data-quick-tab]").forEach(button => {
      const active = button.dataset.quickTab === state.tab;
      button.classList.toggle("active", active);
      button.setAttribute("aria-selected", String(active));
    });
    $("#quickSearch").placeholder = state.tab === "notes" ? "Cerca appunti" : "Cerca modelli Plus";

    const query = state.query.trim().toLowerCase();
    const items = (state.tab === "notes" ? state.notes : state.templates)
      .filter(item => !query || searchable(item).includes(query));
    list.replaceChildren();
    if (!items.length) {
      const empty = document.createElement("div");
      empty.className = "quick-panel-empty";
      empty.textContent = query ? "Nessun risultato." : state.tab === "notes" ? "Nessun appunto salvato." : "Nessun modello Plus salvato.";
      list.appendChild(empty);
      return;
    }

    items.forEach(item => {
      const card = document.createElement("article");
      card.className = "quick-card";
      const title = document.createElement("h2");
      title.textContent = item.title || "Senza titolo";
      const preview = document.createElement("p");
      preview.textContent = item.text || item.template || "";
      const tags = document.createElement("div");
      tags.className = "tags";
      if (item.favorite) addTag(tags, "★ Preferito");
      (item.tags || []).forEach(tag => addTag(tags, `#${tag}`));
      const actions = document.createElement("div");
      actions.className = "quick-card-actions";
      if (state.tab === "notes") {
        addButton(actions, item.favorite ? "★" : "☆", "favorite-note", item.id).setAttribute("aria-label", "Preferito");
        addButton(actions, "Copia", "copy-note", item.id, true);
        addButton(actions, "Modifica", "edit-note", item.id);
      } else {
        addTag(tags, `${item.fields.filter(field => field.kind === "manual").length} campi`);
        addButton(actions, item.favorite ? "★" : "☆", "favorite-plus", item.id).setAttribute("aria-label", "Preferito");
        addButton(actions, "Ultra", "ultra-plus", item.id, true);
        addButton(actions, "Compila", "compile-plus", item.id);
      }
      card.append(title, preview, tags, actions);
      list.appendChild(card);
    });
  }

  function openDialog(dialog) {
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");
  }

  function closeDialog(dialog) {
    if (typeof dialog.close === "function") dialog.close();
    else dialog.removeAttribute("open");
  }

  function openNote(id) {
    const note = state.notes.find(item => item.id === id);
    if (!note) return showStatus("Appunto non trovato.", "error");
    currentNoteId = id;
    $("#quickNoteErrors").textContent = "";
    $("#quickNoteTitle").value = note.title || "";
    $("#quickNoteText").value = note.text || "";
    $("#quickNoteTags").value = (note.tags || []).join(", ");
    openDialog(noteDialog);
    $("#quickNoteTitle").focus();
  }

  function plusValues() {
    return Object.fromEntries(Array.from(document.querySelectorAll("[data-quick-plus-field]"))
      .map(field => [field.dataset.quickPlusField, field.type === "checkbox" ? field.checked : field.value]));
  }

  function schedulePreview() {
    clearTimeout(previewTimer);
    $("#quickPlusCopy").disabled = true;
    const version = ++previewVersion;
    previewTimer = setTimeout(async () => {
      try {
        const data = await request("preview-plus", { id: currentTemplateId, values: plusValues() });
        if (version !== previewVersion || !plusDialog.hasAttribute("open")) return;
        currentOutput = data.output || "";
        $("#quickPlusPreview").textContent = currentOutput;
        const messages = [...(data.errors || []), ...(data.warnings || [])];
        $("#quickPlusErrors").textContent = messages.join("\n");
        $("#quickPlusCopy").disabled = Boolean((data.errors || []).length);
      } catch (error) {
        if (version === previewVersion) $("#quickPlusErrors").textContent = error.message;
      }
    }, 90);
  }

  function openPlus(id) {
    const template = state.templates.find(item => item.id === id);
    if (!template) return showStatus("Modello non trovato.", "error");
    currentTemplateId = id;
    currentOutput = "";
    $("#quickPlusTitle").textContent = template.title || "Compila modello";
    $("#quickPlusErrors").textContent = "";
    $("#quickPlusPreview").textContent = "";
    $("#quickPlusCopy").disabled = true;
    const fields = $("#quickPlusFields");
    fields.replaceChildren();
    template.fields.filter(field => field.kind === "manual").forEach(field => {
      const row = document.createElement("div");
      row.className = "form-row";
      const label = document.createElement("label");
      label.textContent = field.inputType === "checkbox" ? field.label || field.name : `${field.name}${field.required === false ? " · facoltativo" : ""}`;
      const input = document.createElement(field.inputType === "textarea" ? "textarea" : "input");
      input.className = field.inputType === "checkbox" ? "" : "field";
      if (field.inputType === "checkbox") input.type = "checkbox";
      input.dataset.quickPlusField = field.name;
      if (field.inputType !== "checkbox") input.value = template.lastValues?.[field.name] || "";
      label.htmlFor = `quickPlus-${field.name}`;
      input.id = `quickPlus-${field.name}`;
      if (field.inputType === "date") {
        input.placeholder = "gg/mm/aaaa";
        const wrapper = document.createElement("div");
        wrapper.className = "date-input";
        const button = document.createElement("button");
        button.type = "button";
        button.className = "btn";
        button.textContent = "📅";
        button.title = "Scegli dal calendario";
        button.setAttribute("aria-label", "Scegli dal calendario");
        const proxy = document.createElement("input");
        proxy.type = "date";
        proxy.className = "date-picker-proxy";
        proxy.tabIndex = -1;
        proxy.setAttribute("aria-hidden", "true");
        button.addEventListener("click", () => {
          const match = input.value.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
          proxy.value = match ? `${match[3]}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}` : "";
          try { proxy.showPicker(); } catch { proxy.focus(); proxy.click(); }
        });
        proxy.addEventListener("change", () => {
          if (!proxy.value) return;
          const [year, month, day] = proxy.value.split("-");
          input.value = `${day}/${month}/${year}`;
          input.dispatchEvent(new Event("input", { bubbles: true }));
          input.focus();
        });
        wrapper.append(input, button, proxy);
        row.append(label, wrapper);
      } else row.append(label, input);
      if (field.inputType === "checkbox") {
        const hint = document.createElement("small");
        hint.textContent = field.checkedText;
        row.append(hint);
      }
      if (field.inputType === "textarea" && field.listInstructions) {
        const instructions = document.createElement("small");
        instructions.className = "list-instructions";
        instructions.textContent = `Indicazioni: ${field.listInstructions}`;
        row.appendChild(instructions);
      }
      if (field.inputType === "textarea" && field.lineInputPattern && field.lineOutputPattern) {
        const transform = document.createElement("small");
        transform.className = "list-instructions";
        transform.textContent = `Input: ${field.lineInputPattern}\nOutput: ${field.lineOutputPattern}`;
        row.appendChild(transform);
      }
      fields.appendChild(row);
    });
    openDialog(plusDialog);
    fields.querySelector("[data-quick-plus-field]")?.focus();
    schedulePreview();
  }

  function htmlForClipboard(text) {
    return String(text)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replace(/\r?\n/g, "<br>");
  }

  async function copyText(text) {
    const plain = String(text).replace(/\r?\n/g, "\r\n");
    if (window.ClipboardItem && navigator.clipboard?.write) {
      try {
        await navigator.clipboard.write([new ClipboardItem({
          "text/plain": new Blob([plain], { type: "text/plain" }),
          "text/html": new Blob([htmlForClipboard(text)], { type: "text/html" })
        })]);
        return;
      } catch (error) {}
    }
    try {
      await navigator.clipboard.writeText(plain);
      return;
    } catch (error) {}
    const helper = document.createElement("textarea");
    helper.value = plain;
    helper.style.position = "fixed";
    helper.style.opacity = "0";
    document.body.appendChild(helper);
    helper.select();
    const copied = document.execCommand("copy");
    helper.remove();
    if (!copied) throw new Error("Copia negli appunti non riuscita.");
  }

  async function runPlusUltra(id) {
    const template = state.templates.find(item => item.id === id);
    if (!template) throw new Error("Modello non trovato.");
    const manualFields = template.fields.filter(field => field.kind === "manual");
    if (manualFields.length !== 1) throw new Error("La modalità Ultra richiede una scheda con un solo campo manuale.");
    if (!navigator.clipboard?.readText) throw new Error("La lettura degli appunti non è disponibile in questa finestra.");

    const source = (await navigator.clipboard.readText()).trim();
    if (!source) throw new Error("Gli appunti sono vuoti.");
    const data = await request("preview-plus", { id, values: { [manualFields[0].name]: source } });
    const issues = [...(data.errors || []), ...(data.warnings || [])];
    if (issues.length) throw new Error(`Contenuto non conforme: ${issues.join(" ")}`);
    await copyText(data.output || "");
  }

  list.addEventListener("click", async event => {
    const button = event.target.closest("[data-quick-action]");
    if (!button) return;
    const { quickAction: action, id } = button.dataset;
    if (action === "favorite-note" || action === "favorite-plus") {
      button.disabled = true;
      try {
        await request(action === "favorite-note" ? "toggle-note-favorite" : "toggle-plus-favorite", { id });
        showStatus("Preferiti aggiornati.", "success");
      } catch (error) {
        showStatus(error.message, "error");
      } finally {
        button.disabled = false;
      }
      return;
    }
    if (action === "edit-note") return openNote(id);
    if (action === "compile-plus") return openPlus(id);
    if (action === "ultra-plus") {
      if (state.templates.find(item => item.id === id)?.fields.some(field => field.inputType === "checkbox")) return openPlus(id);
      button.disabled = true;
      showStatus("Lettura e verifica degli appunti…");
      try {
        await runPlusUltra(id);
        showStatus("Testo elaborato e copiato negli appunti.", "success");
      } catch (error) {
        showStatus(error?.name === "NotAllowedError" ? "Accesso agli appunti negato: consenti la lettura e riprova." : error.message, "error");
      } finally {
        button.disabled = false;
      }
      return;
    }
    const note = state.notes.find(item => item.id === id);
    if (!note) return showStatus("Appunto non trovato.", "error");
    try {
      await copyText(note.text);
      showStatus("Appunto copiato.", "success");
    } catch (error) {
      showStatus("Copia non riuscita.", "error");
    }
  });

  $("#quickNoteForm").addEventListener("submit", async event => {
    event.preventDefault();
    const submit = event.submitter;
    if (submit) submit.disabled = true;
    try {
      await request("save-note", {
        note: {
          id: currentNoteId,
          title: $("#quickNoteTitle").value,
          text: $("#quickNoteText").value,
          tags: $("#quickNoteTags").value
        }
      });
      closeDialog(noteDialog);
      showStatus("Appunto salvato.", "success");
    } catch (error) {
      $("#quickNoteErrors").textContent = error.message;
    } finally {
      if (submit) submit.disabled = false;
    }
  });

  for (const form of [$("#quickNoteForm"), $("#quickPlusForm")]) {
    form.addEventListener("keydown", event => {
      if (event.key !== "Enter" || event.isComposing || event.shiftKey || event.ctrlKey || event.metaKey || event.altKey) return;
      if (!event.target.matches("input:not([type=checkbox])")) return;
      event.preventDefault();
      form.requestSubmit();
    });
  }

  $("#quickPlusForm").addEventListener("input", event => {
    if (event.target.matches("[data-quick-plus-field]")) schedulePreview();
  });

  $("#quickPlusForm").addEventListener("submit", async event => {
    event.preventDefault();
    const submit = event.submitter;
    if (submit) submit.disabled = true;
    try {
      await request("save-plus-values", { id: currentTemplateId, values: plusValues() });
      closeDialog(plusDialog);
      showStatus("Valori salvati.", "success");
    } catch (error) {
      $("#quickPlusErrors").textContent = error.message;
    } finally {
      if (submit) submit.disabled = false;
    }
  });

  $("#quickPlusCopy").addEventListener("click", async () => {
    try {
      await copyText(currentOutput);
      showStatus("Testo copiato.", "success");
    } catch (error) {
      showStatus("Copia non riuscita.", "error");
    }
  });

  $("#quickPlusClear").addEventListener("click", async event => {
    clearTimeout(previewTimer);
    previewVersion++;
    document.querySelectorAll("[data-quick-plus-field]").forEach(field => {
      if (field.type === "checkbox") field.checked = false;
      else field.value = "";
    });
    currentOutput = "";
    $("#quickPlusErrors").textContent = "";
    $("#quickPlusPreview").textContent = "";
    $("#quickPlusCopy").disabled = true;
    document.querySelector("[data-quick-plus-field]")?.focus();
    event.currentTarget.disabled = true;
    try {
      await request("save-plus-values", { id: currentTemplateId, values: plusValues() });
      showStatus("Campi cancellati.", "success");
    } catch (error) {
      showStatus(error.message, "error");
    } finally {
      event.currentTarget.disabled = false;
    }
  });

  document.addEventListener("click", event => {
    const tab = event.target.closest("[data-quick-tab]");
    if (tab) {
      state.tab = tab.dataset.quickTab;
      render();
      return;
    }
    const close = event.target.closest("[data-close-dialog]");
    if (close) closeDialog(document.querySelector(`#${close.dataset.closeDialog}`));
  });

  $("#quickSearch").addEventListener("input", event => {
    state.query = event.target.value;
    render();
  });

  $("#quickReturn").addEventListener("click", () => port?.postMessage({ type: "focus-main" }));

  function connect(nextPort) {
    if (port || !nextPort) return false;
    port = nextPort;
    port.onmessage = channelEvent => {
      const message = channelEvent.data;
      if (message?.type === "theme" && ["light", "dark"].includes(message.theme)) {
        document.documentElement.dataset.theme = message.theme;
        return;
      }
      if (message?.type === "snapshot" && Array.isArray(message.data?.notes) && Array.isArray(message.data?.templates)) {
        if (["light", "dark"].includes(message.data.theme)) document.documentElement.dataset.theme = message.data.theme;
        state.notes = message.data.notes;
        state.templates = message.data.templates;
        render();
        if (message.data.errors?.length) showStatus(message.data.errors.join(" "), "error");
        return;
      }
      if (message?.type === "fatal") {
        showStatus(message.error || "Impossibile leggere gli archivi.", "error");
        return;
      }
      if (message?.type !== "response" || typeof message.requestId !== "string") return;
      const requestState = pending.get(message.requestId);
      if (!requestState) return;
      clearTimeout(requestState.timer);
      pending.delete(message.requestId);
      if (message.ok) requestState.resolve(message.data);
      else requestState.reject(new Error(message.error || "Operazione non riuscita."));
    };
    port.start();
    port.postMessage({ type: "ready" });
    return true;
  }

  window.connectFastAppuntiPanel = (nextPort, receivedToken) => receivedToken === token && connect(nextPort);

  window.addEventListener("message", event => {
    if (port || event.data?.type !== "fastappunti:init" || event.data.token !== token || !event.ports[0]) return;
    if (expectedOrigin !== "null" && event.origin !== expectedOrigin) return;
    // ponytail: il Document PiP può omettere event.source; token, origine e porta privata proteggono il canale.
    connect(event.ports[0]);
  });

  window.addEventListener("pagehide", () => {
    clearTimeout(previewTimer);
    pending.forEach(requestState => {
      clearTimeout(requestState.timer);
      requestState.reject(new Error("Pannello chiuso."));
    });
    pending.clear();
    port?.close();
  });

  render();
  setTimeout(() => {
    if (!port) showStatus("Collegamento con FastAppunti non riuscito. Chiudi il pannello, aggiorna la pagina e riprova.", "error");
  }, 1800);
})();
