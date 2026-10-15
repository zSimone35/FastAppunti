(function () {
      "use strict";

      const DB_NAME = "appunti-rapidi-db";
      const PLUS_DB_NAME = "appunti-plus-db";
      const PLUS_DB_VERSION = 1;
      const STORE = "notes";
      const PLUS_STORE = "plusTemplates";
      const PLUS_OPERATIONS = {
        sum: "Somma",
        multiply: "Moltiplicazione",
        subtract: "Sottrazione"
      };
      // Modelli di esempio caricati al primo avvio: dal più semplice al più completo. Tag "esempio" per filtrarli/eliminarli.
      const man = (name, extra = {}) => ({ name, kind: "manual", inputType: "text", ...extra });
      const sum = (name, source) => ({ name, kind: "computed", operation: "sum", source });
      const PLUS_PRESETS = [
        {
          id: "plus-lista-spesa",
          title: "1 · Lista spesa (somma automatica)",
          template: "Lista spesa: %totale%\n{lista}",
          tags: ["esempio", "spesa", "somma"],
          fields: [
            man("lista", { inputType: "textarea", listInstructions: "Una voce per riga, con il prezzo come ultima cosa: Latte 1,29. Il totale somma l'ultimo numero di ogni riga." }),
            sum("totale", "lista")
          ]
        },
        {
          id: "plus-preset-promemoria",
          title: "2 · Promemoria appuntamento (campi semplici)",
          template: "Buongiorno {nome}, le ricordiamo l'appuntamento di {giorno} alle {ora}.\nPer disdire o spostare risponda a questo messaggio.",
          tags: ["esempio", "whatsapp", "base"],
          fields: [man("nome"), man("giorno"), man("ora")]
        },
        {
          id: "plus-preset-email-cliente",
          title: "3 · Email al cliente (facoltativi, checkbox, elenco puntato)",
          template: "Gentile {cliente},\n\ngrazie per averci scritto. Oggetto della richiesta: {argomento}.\n{punti}\n\n{allegati}\n\nRestiamo a disposizione.\n{firma}",
          tags: ["esempio", "email", "checkbox"],
          fields: [
            man("cliente"),
            man("argomento"),
            man("punti", { inputType: "textarea", required: false, linePrefix: "• ", listInstructions: "Facoltativo: una riga per punto. Ogni riga riceve in automatico il pallino davanti." }),
            man("allegati", { inputType: "checkbox", label: "Ho allegato dei documenti", checkedText: "In allegato trova i documenti richiesti." }),
            man("firma", { required: false })
          ]
        },
        {
          id: "plus-preset-fatture",
          title: "4 · Sollecito fatture (totale + estrazione riferimenti)",
          template: "Gentile cliente, risultano da saldare le seguenti fatture, per un totale di € %totale%:\n{lista}\n\nNella causale del pagamento indichi: fatture %riferimenti%.",
          tags: ["esempio", "fatture", "somma", "estrazione"],
          fields: [
            man("lista", {
              inputType: "textarea",
              extraction: { name: "riferimenti", prefix: "FT" },
              listInstructions: "Una fattura per riga, con importo alla fine: Fattura FT001 del 31/03/2026 120,50. Ogni riga deve contenere una sola parola che inizia per FT: verrà copiata nei riferimenti."
            }),
            sum("totale", "lista")
          ]
        },
        {
          id: "plus-preset-ore",
          title: "5 · Report ore (riformatta ogni riga + somma)",
          template: "Report ore · {progetto}\n{righe}\n\nTotale ore: %totale%",
          tags: ["esempio", "ore", "trasformazione", "somma"],
          fields: [
            man("progetto"),
            man("righe", {
              inputType: "textarea",
              lineInputPattern: "%nome% - %ore%",
              lineOutputPattern: "• %nome%: %ore% h",
              listInstructions: "Una persona per riga nel formato Nome - ore, per esempio Mario Rossi - 7,5. Viene riscritta come «• Mario Rossi: 7,5 h»."
            }),
            sum("totale", "righe")
          ]
        },
        {
          id: "plus-preset-nota-spese",
          title: "6 · Nota spese trasferta (completo: tutto insieme)",
          template: "Nota spese di {dipendente} · {periodo}\n\n{spese}\n\nTotale da rimborsare: € %totale%\nGiustificativi: %codici%\n{ricevute}\n{note}",
          tags: ["esempio", "spese", "completo", "trasformazione", "estrazione", "somma", "checkbox"],
          fields: [
            man("dipendente"),
            man("periodo"),
            man("spese", {
              inputType: "textarea",
              lineInputPattern: "%codice% - %voce% - %importo%",
              lineOutputPattern: "%codice%  %voce%: € %importo%",
              extraction: { name: "codici", prefix: "#" },
              listInstructions: "Una spesa per riga: #codice - descrizione - importo, per esempio #012 - Taxi aeroporto - 23,50. Ogni riga ha un solo codice che inizia per #."
            }),
            sum("totale", "spese"),
            man("ricevute", { inputType: "checkbox", label: "Ricevute originali allegate", checkedText: "Ricevute originali allegate." }),
            man("note", { required: false })
          ]
        },
        {
          id: "plus-preset-superficie",
          title: "7 · Superficie o volume (moltiplicazione)",
          template: "Locale: {locale}\nMisure:\n{misure}\nSuperficie/volume: %risultato%",
          tags: ["esempio", "moltiplicazione", "calcolo"],
          fields: [
            man("locale"),
            man("misure", { inputType: "textarea", listInstructions: "Una misura per riga, numero alla fine: Lunghezza 4,5 / Larghezza 3. Il risultato è il prodotto di tutti i numeri (aggiungi Altezza 2,7 per il volume)." }),
            { name: "risultato", kind: "computed", operation: "multiply", source: "misure" }
          ]
        },
        {
          id: "plus-preset-budget",
          title: "8 · Budget residuo (sottrazione)",
          template: "Situazione budget\n{voci}\n\nResiduo: € %residuo%",
          tags: ["esempio", "sottrazione", "calcolo"],
          fields: [
            man("voci", { inputType: "textarea", listInstructions: "La PRIMA riga è il budget di partenza (Budget 1500), le righe successive sono spese da sottrarre (Affitto 600)." }),
            { name: "residuo", kind: "computed", operation: "subtract", source: "voci" }
          ]
        },
        {
          id: "plus-preset-verbale",
          title: "9 · Verbale riunione (più elenchi con prefisso)",
          template: "VERBALE · {titolo} · {data}\nPartecipanti: {partecipanti}\n\nDecisioni:\n{decisioni}\n\nAzioni da fare:\n{azioni}\n\n{invio}",
          tags: ["esempio", "riunione", "elenco"],
          fields: [
            man("titolo"),
            man("data"),
            man("partecipanti"),
            man("decisioni", { inputType: "textarea", linePrefix: "✔ " }),
            man("azioni", { inputType: "textarea", required: false, linePrefix: "☐ ", listInstructions: "Una azione per riga, ad esempio «Mario · preventivo · venerdì»." }),
            man("invio", { inputType: "checkbox", label: "Da inviare ai partecipanti", checkedText: "Si prega di confermare la ricezione." })
          ]
        }
      ];
      PLUS_PRESETS.push(
        {
          id: "plus-preset-ordine",
          title: "10 · Conferma ordine (righe riformattate, totale, spedizione)",
          template: "Ordine per {cliente}\n{articoli}\n\nTotale: € %totale%\n{spedizione}",
          tags: ["esempio", "ordine", "trasformazione", "somma", "checkbox"],
          fields: [
            man("cliente"),
            man("articoli", {
              inputType: "textarea",
              lineInputPattern: "%articolo% - %prezzo%",
              lineOutputPattern: "▪ %articolo% ........ € %prezzo%",
              listInstructions: "Un articolo per riga: Nome - prezzo, per esempio Cuffie wireless - 59,90."
            }),
            sum("totale", "articoli"),
            man("spedizione", { inputType: "checkbox", label: "Spedizione gratuita", checkedText: "Spedizione gratuita inclusa." })
          ]
        },
        {
          id: "plus-preset-rimborso-km",
          title: "11 · Rimborso chilometrico (moltiplicazione)",
          template: "Rimborso per la tratta {tratta}\n{dati}\nImporto da rimborsare: € %importo%",
          tags: ["esempio", "moltiplicazione", "spese"],
          fields: [
            man("tratta"),
            man("dati", { inputType: "textarea", listInstructions: "Due righe: Km percorsi 120 e Tariffa al km 0,35. L'importo è il prodotto dei due numeri." }),
            { name: "importo", kind: "computed", operation: "multiply", source: "dati" }
          ]
        },
        {
          id: "plus-preset-rilascio",
          title: "12 · Note di rilascio (due elenchi facoltativi)",
          template: "Versione {versione}\n\nNovità:\n{novita}\n\nCorrezioni:\n{correzioni}\n\n{migrazione}",
          tags: ["esempio", "elenco", "checkbox"],
          fields: [
            man("versione"),
            man("novita", { inputType: "textarea", required: false, linePrefix: "+ " }),
            man("correzioni", { inputType: "textarea", required: false, linePrefix: "- " }),
            man("migrazione", { inputType: "checkbox", label: "Richiede migrazione dati", checkedText: "Attenzione: questa versione richiede una migrazione dei dati." })
          ]
        }
      );
      const NOTE_PRESETS = [
        {
          id: "nota-preset-risposta",
          title: "Esempio: risposta rapida",
          text: "Ciao, ho ricevuto il tuo messaggio. Ti rispondo con tutti i dettagli entro oggi.",
          tags: ["esempio", "email", "lavoro"]
        },
        {
          id: "nota-preset-dati-fatturazione",
          title: "Esempio: dati di fatturazione",
          text: "Acme S.r.l.\nVia Roma 1, 00100 Roma\nP.IVA 00000000000\nIBAN IT00X0000000000000000000000\nSDI: 0000000",
          tags: ["esempio", "fatturazione"]
        },
        {
          id: "nota-preset-comando",
          title: "Esempio: comando ricorrente",
          text: "git status && git pull --rebase && git log --oneline -5",
          tags: ["esempio", "snippet", "comandi"]
        },
        {
          id: "nota-preset-firma",
          title: "Esempio: firma email",
          text: "Cordiali saluti,\nNome Cognome\nRuolo · Azienda\nTel. 000 0000000",
          tags: ["esempio", "email", "firma"]
        }
      ];
      const isPreset = item => item.id === "plus-lista-spesa" || /^(plus|nota)-preset-/.test(item.id);
      const PAGE_SIZE = 80;
      const DEFAULT_VIEW = document.body.dataset.defaultView || "list";
      const NOTE_VIEWS = ["list", "new", "edit", "backup"];
      const PLUS_VIEWS = ["tool", "plus-new", "plus-edit", "plus-backup"];
      const STORAGE_BRIDGE_TOKEN = new URLSearchParams(location.search).get("storageBridge") || "";
      const QUICK_PANEL_DEFAULTS = { width: 360, height: 520 };
      const QUICK_PANEL_MESSAGES = new Set(["ready", "save-note", "preview-plus", "save-plus-values", "toggle-note-favorite", "toggle-plus-favorite", "focus-main"]);

      const state = {
        db: null,
        plusDb: null,
        notes: [],
        filtered: [],
        rendered: 0,
        query: "",
        activeTag: "",
        plusTemplates: [],
        plusQuery: "",
        plusActiveTag: "",
        plusUltra: false,
        currentView: DEFAULT_VIEW,
        editId: null,
        plusDraft: null,
        plusCursor: null,
        windowSeq: 0,
        windowZ: 100,
        quickPanel: { window: null, port: null, token: "", mode: "", preferPopup: false },
        storageBridge: { iframe: null, port: null, pending: new Map(), counter: 0, promise: null }
      };

      const $ = (selector, root = document) => root.querySelector(selector);
      const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
      const view = $("#view");

      function requestToPromise(request) {
        return new Promise((resolve, reject) => {
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });
      }

      function openDb() {
        return new Promise((resolve, reject) => {
          const request = indexedDB.open(DB_NAME);
          request.onupgradeneeded = event => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains(STORE)) {
              const store = db.createObjectStore(STORE, { keyPath: "id" });
              store.createIndex("updatedAt", "updatedAt", { unique: false });
              store.createIndex("createdAt", "createdAt", { unique: false });
              store.createIndex("tags", "tags", { unique: false, multiEntry: true });
              const now = new Date().toISOString();
              NOTE_PRESETS.forEach((preset, order) => store.add({
                ...preset, favorite: false, order, createdAt: now, updatedAt: now
              }));
            }
          };
          request.onsuccess = () => {
            request.result.onversionchange = () => request.result.close();
            resolve(request.result);
          };
          request.onerror = () => reject(request.error);
          request.onblocked = () => reject(new Error("Archivio FastAppunti bloccato da un'altra scheda aperta."));
        });
      }

      async function ensureDb() {
        if (!state.db) state.db = await openDb();
        return state.db;
      }

      function openPlusDb() {
        return new Promise((resolve, reject) => {
          const request = indexedDB.open(PLUS_DB_NAME, PLUS_DB_VERSION);
          request.onupgradeneeded = event => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains(PLUS_STORE)) {
              const store = db.createObjectStore(PLUS_STORE, { keyPath: "id" });
              store.createIndex("updatedAt", "updatedAt", { unique: false });
              const now = new Date().toISOString();
              PLUS_PRESETS.forEach((preset, order) => store.add({
                ...preset, lastValues: {}, favorite: false, order, createdAt: now, updatedAt: now
              }));
            }
          };
          request.onsuccess = () => {
            request.result.onversionchange = () => request.result.close();
            resolve(request.result);
          };
          request.onerror = () => reject(request.error);
          request.onblocked = () => reject(new Error("Archivio Appunti Plus bloccato da un'altra scheda aperta."));
        });
      }

      async function ensurePlusDb() {
        if (!state.plusDb) state.plusDb = await openPlusDb();
        return state.plusDb;
      }

      function tx(mode = "readonly") {
        return state.db.transaction(STORE, mode).objectStore(STORE);
      }

      function plusTx(mode = "readonly") {
        return state.plusDb.transaction(PLUS_STORE, mode).objectStore(PLUS_STORE);
      }

      async function getAllPlusTemplates() {
        await ensurePlusDb();
        const templates = await requestToPromise(plusTx().getAll());
        const normalized = templates.map(normalizePlusTemplate).sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
        normalized.forEach((template, index) => {
          if (!Number.isFinite(template.order)) template.order = index;
        });
        return normalized.sort((a, b) => Number(b.favorite) - Number(a.favorite) || a.order - b.order);
      }

      async function getPlusTemplate(id) {
        await ensurePlusDb();
        const template = await requestToPromise(plusTx().get(id));
        return template ? normalizePlusTemplate(template) : template;
      }

      async function savePlusTemplate(template) {
        await ensurePlusDb();
        await requestToPromise(plusTx("readwrite").put(template));
        return template;
      }

      async function deletePlusTemplate(id) {
        await ensurePlusDb();
        await requestToPromise(plusTx("readwrite").delete(id));
      }

      async function getAllNotes() {
        const store = tx("readonly");
        const index = store.index("updatedAt");
        return new Promise((resolve, reject) => {
          const notes = [];
          const request = index.openCursor(null, "prev");
          request.onsuccess = event => {
            const cursor = event.target.result;
            if (cursor) {
              notes.push(cursor.value);
              cursor.continue();
            } else {
              notes.forEach((note, index) => {
                if (!Number.isFinite(note.order)) note.order = index;
                note.favorite = Boolean(note.favorite);
              });
              notes.sort((a, b) => Number(b.favorite) - Number(a.favorite) || a.order - b.order);
              resolve(notes);
            }
          };
          request.onerror = () => reject(request.error);
        });
      }

      async function getNote(id) {
        return requestToPromise(tx("readonly").get(id));
      }

      async function saveNote(note) {
        const store = tx("readwrite");
        await requestToPromise(store.put(note));
        return note;
      }

      async function deleteNote(id) {
        await requestToPromise(tx("readwrite").delete(id));
      }

      async function clearNotes() {
        await requestToPromise(tx("readwrite").clear());
      }

      function quickNotesPayload(notes) {
        return notes.map(note => ({
          id: note.id,
          title: note.title,
          text: note.text,
          tags: note.tags || [],
          favorite: Boolean(note.favorite),
          updatedAt: note.updatedAt
        }));
      }

      function quickTemplatesPayload(templates) {
        return templates.map(template => ({
          id: template.id,
          title: template.title,
          template: template.template,
          tags: template.tags || [],
          fields: template.fields.map(cleanPlusField),
          lastValues: { ...(template.lastValues || {}) },
          favorite: Boolean(template.favorite),
          updatedAt: template.updatedAt
        }));
      }

      async function handleStorageBridgeRequest(port, message) {
        if (!message || typeof message.type !== "string" || typeof message.requestId !== "string") return;
        try {
          let data = null;
          if (message.type === "snapshot") {
            if (DEFAULT_VIEW === "tool") {
              data = { notes: [], templates: quickTemplatesPayload(await getAllPlusTemplates()) };
            } else {
              await ensureDb();
              data = { notes: quickNotesPayload(await getAllNotes()), templates: [] };
            }
          } else if (message.type === "save-note" && DEFAULT_VIEW !== "tool") {
            await ensureDb();
            const existing = await getNote(String(message.note?.id || ""));
            if (!existing) throw new Error("Appunto non trovato.");
            const title = String(message.note.title || "").trim().slice(0, 120);
            const text = String(message.note.text || "").trim();
            if (!title || !text) throw new Error("Titolo e testo sono obbligatori.");
            await saveNote({ ...existing, title, text, tags: parseTags(message.note.tags), updatedAt: new Date().toISOString() });
          } else if (message.type === "toggle-note-favorite" && DEFAULT_VIEW !== "tool") {
            const note = await getNote(String(message.id || ""));
            if (!note) throw new Error("Appunto non trovato.");
            note.favorite = !note.favorite;
            await saveNote(note);
          } else if (message.type === "toggle-plus-favorite" && DEFAULT_VIEW === "tool") {
            const template = await getPlusTemplate(String(message.id || ""));
            if (!template) throw new Error("Modello non trovato.");
            template.favorite = !template.favorite;
            await savePlusTemplate(template);
          } else if ((message.type === "preview-plus" || message.type === "save-plus-values") && DEFAULT_VIEW === "tool") {
            const template = await getPlusTemplate(String(message.id || ""));
            if (!template) throw new Error("Modello non trovato.");
            const values = quickPanelValues(template, message.values || {});
            if (message.type === "preview-plus") {
              const result = buildPlusOutput(template.template, template.fields, values);
              data = { output: result.output, errors: result.errors.map(error => error.message), warnings: result.warnings };
            } else {
              template.lastValues = values;
              await savePlusTemplate(template);
            }
          } else {
            throw new Error("Operazione archivio non consentita.");
          }
          port.postMessage({ type: "response", requestId: message.requestId, ok: true, data });
        } catch (error) {
          port.postMessage({ type: "response", requestId: message.requestId, ok: false, error: error?.message || "Operazione non riuscita." });
        }
      }

      async function initStorageBridge() {
        document.body.hidden = true;
        const ready = DEFAULT_VIEW === "tool" ? ensurePlusDb() : ensureDb();
        window.addEventListener("message", async event => {
          if (event.data?.type !== "fastappunti:storage-bridge-init" || event.data.token !== STORAGE_BRIDGE_TOKEN || !event.ports[0]) return;
          const port = event.ports[0];
          try {
            await ready;
          } catch (error) {
            port.postMessage({ type: "fatal", error: error?.message || "Archivio non disponibile." });
            return;
          }
          port.onmessage = portEvent => handleStorageBridgeRequest(port, portEvent.data);
          port.start();
          port.postMessage({ type: "ready" });
        });
        await ready;
      }

      function ensureStorageBridge() {
        const bridge = state.storageBridge;
        if (bridge.port) return Promise.resolve(bridge.port);
        if (bridge.promise) return bridge.promise;
        bridge.promise = new Promise((resolve, reject) => {
          const token = uid();
          const iframe = document.createElement("iframe");
          const channel = new MessageChannel();
          const target = DEFAULT_VIEW === "tool" ? "Appunti Menager.html" : "Appunti Plus.html";
          const url = new URL(target, location.href);
          url.search = "";
          url.searchParams.set("storageBridge", token);
          iframe.src = url.href;
          iframe.hidden = true;
          iframe.setAttribute("aria-hidden", "true");
          bridge.iframe = iframe;
          bridge.port = channel.port1;
          const timeout = setTimeout(() => {
            bridge.port?.close();
            bridge.port = null;
            bridge.promise = null;
            reject(new Error("L’altro archivio locale non ha risposto."));
          }, 5000);
          channel.port1.onmessage = event => {
            const message = event.data;
            if (message?.type === "ready") {
              clearTimeout(timeout);
              resolve(channel.port1);
              return;
            }
            if (message?.type === "fatal") {
              clearTimeout(timeout);
              bridge.port = null;
              bridge.promise = null;
              reject(new Error(message.error || "Archivio non disponibile."));
              return;
            }
            if (message?.type !== "response" || typeof message.requestId !== "string") return;
            const request = bridge.pending.get(message.requestId);
            if (!request) return;
            clearTimeout(request.timer);
            bridge.pending.delete(message.requestId);
            if (message.ok) request.resolve(message.data);
            else request.reject(new Error(message.error || "Operazione non riuscita."));
          };
          channel.port1.start();
          iframe.addEventListener("load", () => {
            iframe.contentWindow.postMessage({ type: "fastappunti:storage-bridge-init", token }, "*", [channel.port2]);
          }, { once: true });
          iframe.addEventListener("error", () => {
            clearTimeout(timeout);
            bridge.port = null;
            bridge.promise = null;
            reject(new Error("Impossibile aprire l’altro archivio locale."));
          }, { once: true });
          document.body.appendChild(iframe);
        });
        return bridge.promise;
      }

      async function storageBridgeRequest(type, payload = {}) {
        const bridge = state.storageBridge;
        const port = await ensureStorageBridge();
        const requestId = `${Date.now()}-${++bridge.counter}`;
        return new Promise((resolve, reject) => {
          const timer = setTimeout(() => {
            bridge.pending.delete(requestId);
            reject(new Error("L’altro archivio locale non ha risposto."));
          }, 5000);
          bridge.pending.set(requestId, { resolve, reject, timer });
          port.postMessage({ type, requestId, ...payload });
        });
      }

      function uid() {
        if (crypto && crypto.randomUUID) return crypto.randomUUID();
        return "note-" + Date.now() + "-" + Math.random().toString(16).slice(2);
      }

      function escapeHtml(value) {
        return String(value || "")
          .replaceAll("&", "&amp;")
          .replaceAll("<", "&lt;")
          .replaceAll(">", "&gt;")
          .replaceAll('"', "&quot;")
          .replaceAll("'", "&#039;");
      }

      function clipboardFormats(text) {
        return {
          plain: String(text).replace(/\r?\n/g, "\r\n"),
          html: escapeHtml(text).replace(/\r?\n/g, "<br>")
        };
      }

      const clipboardCheck = clipboardFormats("a & b\nc");
      console.assert(
        clipboardCheck.plain === "a & b\r\nc" && clipboardCheck.html === "a &amp; b<br>c",
        "Formati degli appunti non validi"
      );

      function parseTags(value) {
        return String(value || "")
          .split(",")
          .map(tag => tag.trim().replace(/^#/, ""))
          .filter(Boolean)
          .map(tag => tag.toLowerCase())
          .filter((tag, index, list) => list.indexOf(tag) === index);
      }

      function isQuickPanelRequest(message) {
        if (!message || typeof message !== "object" || !QUICK_PANEL_MESSAGES.has(message.type)) return false;
        if (message.type === "ready" || message.type === "focus-main") return true;
        if (typeof message.requestId !== "string" || !message.requestId) return false;
        if (message.type === "save-note") {
          return message.note && typeof message.note === "object"
            && typeof message.note.id === "string"
            && typeof message.note.title === "string"
            && typeof message.note.text === "string"
            && typeof message.note.tags === "string";
        }
        if (message.type === "toggle-note-favorite" || message.type === "toggle-plus-favorite") {
          return typeof message.id === "string" && Boolean(message.id);
        }
        return typeof message.id === "string"
          && message.values && typeof message.values === "object" && !Array.isArray(message.values)
          && Object.values(message.values).every(value => typeof value === "string" || typeof value === "boolean");
      }

      console.assert(
        isQuickPanelRequest({ type: "save-note", requestId: "1", note: { id: "a", title: "T", text: "X", tags: "tag" } })
          && !isQuickPanelRequest({ type: "save-note", requestId: "1", note: { id: "a", title: "T", text: "X", tags: [] } })
          && isQuickPanelRequest({ type: "toggle-plus-favorite", requestId: "1", id: "a" })
          && !isQuickPanelRequest({ type: "toggle-plus-favorite", requestId: "1", id: "" })
          && !isQuickPanelRequest({ type: "unknown" }),
        "Protocollo pannello rapido non valido"
      );

      const PLACEHOLDER_NAME = /^[\p{L}][\p{L}\p{N}_]*$/u;

      function normalizePlusField(field) {
        if (field.kind !== "computed") {
          return {
            name: String(field.name || ""),
            kind: "manual",
            inputType: ["textarea", "checkbox"].includes(field.inputType) ? field.inputType : "text",
            required: field.inputType !== "checkbox" && field.required !== false,
            label: String(field.label || ""),
            checkedText: String(field.checkedText || ""),
            linePrefix: String(field.linePrefix || ""),
            listInstructions: String(field.listInstructions || ""),
            lineInputPattern: String(field.lineInputPattern || ""),
            lineOutputPattern: String(field.lineOutputPattern || ""),
            ...(field.extraction ? { extraction: {
              name: String(field.extraction.name || ""),
              prefix: String(field.extraction.prefix || "")
            } } : {})
          };
        }

        const normalized = {
          name: String(field.name || ""),
          kind: "computed",
          operation: String(field.operation || ""),
          source: String(field.source || "")
        };
        const legacySum = String(field.formula || "").trim().match(/^SOMMA_ULTIMI\(\s*([^)]+?)\s*\)$/iu);
        if (!normalized.operation && legacySum) {
          normalized.operation = "sum";
          normalized.source = legacySum[1].trim();
        } else if (field.formula && !normalized.operation) {
          normalized.formula = String(field.formula);
        }
        return normalized;
      }

      function normalizePlusTemplate(template) {
        return {
          ...template,
          favorite: Boolean(template.favorite),
          tags: Array.isArray(template.tags) ? parseTags(template.tags.join(",")) : parseTags(template.tags || ""),
          fields: Array.isArray(template.fields) ? template.fields.map(normalizePlusField) : []
        };
      }

      function cleanPlusField(field) {
        return field.kind === "computed"
          ? { name: field.name, kind: "computed", operation: field.operation, source: field.source }
          : {
              name: field.name,
              kind: "manual",
              inputType: field.inputType,
              required: field.inputType !== "checkbox" && field.required !== false,
              label: String(field.label || ""),
              checkedText: String(field.checkedText || ""),
              linePrefix: String(field.linePrefix || ""),
              listInstructions: String(field.listInstructions || ""),
              lineInputPattern: String(field.lineInputPattern || ""),
              lineOutputPattern: String(field.lineOutputPattern || ""),
              ...(field.extraction ? { extraction: { ...field.extraction } } : {})
            };
      }

      function readTemplateTokens(template) {
        const tokens = [];
        const invalid = [];
        for (const match of String(template || "").matchAll(/\{([^{}\n]*)\}|%([^%\n]*)%/g)) {
          const kind = match[1] !== undefined ? "manual" : "computed";
          const name = (match[1] ?? match[2]).trim();
          if (!PLACEHOLDER_NAME.test(name)) invalid.push(match[0]);
          else tokens.push({ name, kind, token: match[0] });
        }
        return { tokens, invalid };
      }

      function readLastNumbers(value) {
        const numbers = [];
        const invalidLines = [];
        String(value || "").split(/\r?\n/).forEach((line, index) => {
          if (!line.trim()) return;
          const match = line.match(/([+-]?\d[\d.,]*)\s*$/);
          if (!match) return invalidLines.push(index + 1);
          let number = match[1];
          if (number.includes(",") && number.includes(".")) number = number.replaceAll(".", "").replace(",", ".");
          else number = number.replace(",", ".");
          const parsed = Number(number);
          if (!Number.isFinite(parsed)) invalidLines.push(index + 1);
          else numbers.push(parsed);
        });
        return { numbers, invalidLines };
      }

      function extractPrefixedWord(value, prefix) {
        const matches = [];
        const errors = [];
        String(value || "").split(/\r?\n/).forEach((line, index) => {
          if (!line.trim()) return;
          const words = line.trim().split(/\s+/).filter(word => word.startsWith(prefix));
          if (words.length !== 1) {
            errors.push(`Riga ${index + 1}: trovate ${words.length} parole che iniziano con “${prefix}”.`);
          } else {
            matches.push(words[0]);
          }
        });
        return { value: [...new Set(matches)].join(", "), errors };
      }

      function readLinePatternTokens(pattern) {
        const tokens = [];
        const invalid = [];
        for (const match of String(pattern || "").matchAll(/%([^%\n]*)%/g)) {
          const name = match[1].trim();
          if (!PLACEHOLDER_NAME.test(name)) invalid.push(match[0]);
          else tokens.push(name);
        }
        return { tokens, invalid };
      }

      function flexibleLiteralPattern(value) {
        return String(value).split(/(\s+)/).map(part => /\s/.test(part)
          ? "\\s+"
          : part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("");
      }

      function compileLineInputPattern(pattern) {
        const names = [];
        let source = "^\\s*";
        let cursor = 0;
        for (const match of String(pattern || "").trim().matchAll(/%([^%\n]*)%/g)) {
          source += flexibleLiteralPattern(String(pattern).trim().slice(cursor, match.index));
          source += "(.+?)";
          names.push(match[1].trim());
          cursor = match.index + match[0].length;
        }
        source += flexibleLiteralPattern(String(pattern).trim().slice(cursor));
        source += "\\s*$";
        return { names, regex: new RegExp(source, "iu") };
      }

      function transformMultilineValue(value, field) {
        const inputPattern = String(field.lineInputPattern || "").trim();
        const outputPattern = String(field.lineOutputPattern || "").trim();
        if (!inputPattern || !outputPattern) return { value: String(value || ""), errors: [] };
        const compiled = compileLineInputPattern(inputPattern);
        const errors = [];
        let lineNumber = 0;
        const parts = String(value || "").split(/(\r?\n)/).map((line, index) => {
          if (index % 2) return line;
          lineNumber += 1;
          if (!line.trim()) return line;
          const match = compiled.regex.exec(line);
          if (!match) {
            errors.push(`Riga ${lineNumber}: non rispetta il formato di input previsto.`);
            return line;
          }
          const captured = Object.fromEntries(compiled.names.map((name, captureIndex) => [name, match[captureIndex + 1].trim()]));
          return outputPattern.replace(/%([^%\n]*)%/g, (_, name) => captured[name.trim()] ?? "");
        });
        return { value: parts.join(""), errors };
      }

      function evaluateComputedFields(fields, values) {
        const byName = new Map(fields.map(field => [field.name, field]));
        const results = {};
        const warnings = new Map();
        const errors = [];
        fields.filter(field => field.kind === "computed").forEach(field => {
          const source = byName.get(field.source);
          if (!PLUS_OPERATIONS[field.operation] || !source || source.kind !== "manual" || source.inputType === "checkbox") {
            errors.push({ fieldName: field.name, message: "Scegli un’operazione e un campo manuale sorgente." });
            return;
          }
          if (source.required === false && !String(values[field.source] || "").trim()) {
            results[field.name] = null;
            return;
          }
          const parsed = readLastNumbers(values[field.source]);
          parsed.invalidLines.forEach(line => warnings.set(`${field.source}:${line}`, `Riga ${line} di {${field.source}} ignorata: manca un numero finale.`));
          if (!parsed.numbers.length) {
            errors.push({ fieldName: field.name, message: `Il campo {${field.source}} non contiene numeri finali validi.` });
            return;
          }
          if (field.operation === "sum") results[field.name] = parsed.numbers.reduce((total, number) => total + number, 0);
          if (field.operation === "multiply") results[field.name] = parsed.numbers.reduce((total, number) => total * number, 1);
          if (field.operation === "subtract") results[field.name] = parsed.numbers.slice(1).reduce((total, number) => total - number, parsed.numbers[0]);
        });
        return { results, warnings: [...warnings.values()], errors };
      }

      function validatePlusConfig(title, template, fields) {
        const errors = [];
        const parsed = readTemplateTokens(template);
        const seen = new Set();
        const tokenKeys = new Set(parsed.tokens.map(token => `${token.kind}:${token.name}`));

        if (!String(title || "").trim()) errors.push({ target: "plusTitle", message: "Inserisci il titolo della scheda." });
        if (!String(template || "").trim()) errors.push({ target: "plusTemplate", message: "Inserisci il testo del modello." });
        parsed.invalid.forEach(token => errors.push({ target: "plusTemplate", message: `Il placeholder ${token} ha un nome non valido.` }));

        for (const field of fields) {
          const target = field.kind === "computed" ? `computed:${field.name}` : `field:${field.name}`;
          if (!PLACEHOLDER_NAME.test(field.name)) errors.push({ target, message: `“${field.name}” non è un nome valido.` });
          if (seen.has(field.name)) errors.push({ target, message: `Il nome “${field.name}” è duplicato.` });
          seen.add(field.name);
          if (!tokenKeys.has(`${field.kind}:${field.name}`)) errors.push({ target, message: `Il placeholder di “${field.name}” non compare nel testo.` });
          if (field.kind === "computed") {
            if (field.formula && !field.operation) errors.push({ target, message: "La formula precedente non è più supportata: scegli una delle tre operazioni." });
            if (!PLUS_OPERATIONS[field.operation]) errors.push({ target, message: "Scegli somma, moltiplicazione o sottrazione." });
            if (!fields.some(source => source.kind === "manual" && source.inputType !== "checkbox" && source.name === field.source)) errors.push({ target, message: "Scegli un campo testuale sorgente." });
          }
          if (field.kind === "manual" && field.inputType === "checkbox") {
            if (!String(field.checkedText || "").trim()) errors.push({ target, message: "Inserisci il testo da aggiungere quando la checkbox è selezionata." });
            if (field.extraction || field.lineInputPattern || field.lineOutputPattern) errors.push({ target, message: "Le checkbox non supportano estrazioni o trasformazioni." });
          }
          if (field.kind === "manual" && field.extraction) {
            const extractionTarget = `extract:${field.name}`;
            const extractionName = String(field.extraction.name || "").trim();
            const prefix = String(field.extraction.prefix || "").trim();
            if (!PLACEHOLDER_NAME.test(extractionName)) errors.push({ target: extractionTarget, message: "Inserisci un nome valido per il placeholder estratto." });
            if (!prefix || /\s/.test(prefix)) errors.push({ target: extractionTarget, message: "Il prefisso è obbligatorio e non può contenere spazi." });
            if (seen.has(extractionName)) errors.push({ target: extractionTarget, message: `Il nome “${extractionName}” è duplicato.` });
            seen.add(extractionName);
            if (PLACEHOLDER_NAME.test(extractionName) && !tokenKeys.has(`computed:${extractionName}`)) {
              errors.push({ target: extractionTarget, message: `Il placeholder %${extractionName}% non compare nel testo.` });
            }
          }
          if (field.kind === "manual") {
            const transformTarget = `transform:${field.name}`;
            const inputPattern = String(field.lineInputPattern || "").trim();
            const outputPattern = String(field.lineOutputPattern || "").trim();
            if (Boolean(inputPattern) !== Boolean(outputPattern)) {
              errors.push({ target: transformTarget, message: "Compila sia il formato di input sia quello di uscita." });
            } else if (inputPattern && outputPattern) {
              const inputTokens = readLinePatternTokens(inputPattern);
              const outputTokens = readLinePatternTokens(outputPattern);
              if (field.inputType !== "textarea") errors.push({ target: transformTarget, message: "La trasformazione per righe richiede un testo multilinea." });
              if (!inputTokens.tokens.length) errors.push({ target: transformTarget, message: "Il formato di input deve contenere almeno un segnaposto, per esempio %data%." });
              inputTokens.invalid.concat(outputTokens.invalid).forEach(token => errors.push({ target: transformTarget, message: `Il segnaposto ${token} non è valido.` }));
              const available = new Set(inputTokens.tokens);
              outputTokens.tokens.filter(name => !available.has(name)).forEach(name => {
                errors.push({ target: transformTarget, message: `Il segnaposto %${name}% non è presente nel formato di input.` });
              });
            }
          }
        }

        const fieldKeys = new Set(fields.map(field => `${field.kind}:${field.name}`));
        fields.filter(field => field.kind === "manual" && field.extraction).forEach(field => fieldKeys.add(`computed:${field.extraction.name}`));
        parsed.tokens.forEach(token => {
          if (!fieldKeys.has(`${token.kind}:${token.name}`)) {
            errors.push({ target: "plusTemplate", message: `Il placeholder ${token.token} non è configurato. Inseriscilo con il pulsante dedicato.` });
          }
        });

        return errors;
      }

      function formatAmount(value) {
        return new Intl.NumberFormat("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
      }

      function buildPlusOutput(template, fields, values) {
        const errors = fields
          .filter(field => field.kind === "manual" && field.inputType !== "checkbox" && field.required !== false && !String(values[field.name] || "").trim())
          .map(field => ({ target: `value:${field.name}`, message: `Il campo {${field.name}} è obbligatorio.` }));
        const calculated = evaluateComputedFields(fields, values);
        calculated.errors.forEach(error => errors.push({ target: "plusRunErrors", message: `%${error.fieldName}%: ${error.message}` }));

        let output = String(template || "");
        fields.filter(field => field.kind === "manual").forEach(field => {
          const value = field.inputType === "checkbox"
            ? (values[field.name] === true ? field.checkedText : "")
            : field.required === false && !String(values[field.name] || "").trim() ? "" : String(values[field.name] || "");
          const transformed = field.inputType === "textarea" ? transformMultilineValue(value, field) : { value, errors: [] };
          transformed.errors.forEach(message => errors.push({ target: `value:${field.name}`, message }));
          const formatted = field.inputType === "textarea" && field.linePrefix
            ? transformed.value.replace(/[^\r\n]+/g, line => line.trim() ? field.linePrefix + line : line)
            : transformed.value;
          output = output.split(`{${field.name}}`).join(formatted);
        });
        fields.filter(field => field.kind === "computed").forEach(field => {
          if (Object.prototype.hasOwnProperty.call(calculated.results, field.name)) {
            output = output.split(`%${field.name}%`).join(calculated.results[field.name] === null ? "" : formatAmount(calculated.results[field.name]));
          }
        });
        fields.filter(field => field.kind === "manual" && field.extraction).forEach(field => {
          if (field.required === false && !String(values[field.name] || "").trim()) {
            output = output.split(`%${field.extraction.name}%`).join("");
            return;
          }
          const extracted = extractPrefixedWord(values[field.name], field.extraction.prefix);
          extracted.errors.forEach(message => errors.push({ target: `value:${field.name}`, message }));
          if (!extracted.errors.length) output = output.split(`%${field.extraction.name}%`).join(extracted.value);
        });
        return { output, errors, warnings: calculated.warnings };
      }

      const plusSelfCheck = buildPlusOutput(
        "Ciao Pippo ecco il riepilogo fatture somma: %totale%\n{lista}\nRiferimento fattura: %riferimento%",
        [
          { name: "lista", kind: "manual", inputType: "textarea", extraction: { name: "riferimento", prefix: "A00" } },
          { name: "totale", kind: "computed", operation: "sum", source: "lista" }
        ],
        { lista: "fatt. A0012431 - data 31/03/2026 E 45,21\nfatt. A0012431 - data 30/04/2026 E 45,21\nfatt. A0012431 - data 31/05/2026 E 45,21" }
      );
      const plusOperationsCheck = evaluateComputedFields([
        { name: "lista", kind: "manual" },
        { name: "prodotto", kind: "computed", operation: "multiply", source: "lista" },
        { name: "differenza", kind: "computed", operation: "subtract", source: "lista" }
      ], { lista: "Voce 10\nVoce 2" });
      const plusExtractionCheck = extractPrefixedWord("fatt. A001\nfatt. A002", "A00");
      const plusLegacyCheck = validatePlusConfig("Test", "%totale%", [{ name: "totale", kind: "computed", formula: "1 / 0" }]);
      const plusTagsCheck = normalizePlusTemplate({ tags: ["Lavoro", "lavoro", "#Email"], fields: [] });
      console.assert(
        plusSelfCheck.output.includes("135,63") && plusSelfCheck.output.endsWith("A0012431") && !plusSelfCheck.errors.length
          && plusOperationsCheck.results.prodotto === 20 && plusOperationsCheck.results.differenza === 8
          && !plusExtractionCheck.errors.length && plusExtractionCheck.value === "A001, A002"
          && plusTagsCheck.tags.join(",") === "lavoro,email"
          && plusLegacyCheck.some(error => error.message.includes("non è più supportata")),
        "Calcolo o validazione Appunti Plus non validi"
      );

      function formatDate(value) {
        return new Intl.DateTimeFormat("it-IT", {
          day: "2-digit",
          month: "short",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit"
        }).format(new Date(value));
      }

      function toast(message, tone = "default") {
        const stack = $("#toastStack");
        const item = document.createElement("div");
        item.className = "toast";
        if (tone === "success") item.style.background = "var(--success)";
        if (tone === "danger") item.style.background = "var(--danger)";
        item.textContent = message;
        stack.appendChild(item);
        setTimeout(() => {
          item.style.opacity = "0";
          item.style.transform = "translateY(8px)";
          setTimeout(() => item.remove(), 180);
        }, 2600);
      }

      function setUrl(viewName, id) {
        const params = new URLSearchParams();
        params.set("view", viewName);
        if (id) params.set("id", id);
        history.pushState({ view: viewName, id }, "", "?" + params.toString());
      }

      function routeFromUrl() {
        const params = new URLSearchParams(location.search);
        const requestedView = params.get("view") || DEFAULT_VIEW;
        const allowedViews = DEFAULT_VIEW === "tool" ? PLUS_VIEWS : NOTE_VIEWS;
        return {
          view: allowedViews.includes(requestedView) ? requestedView : DEFAULT_VIEW,
          id: params.get("id") || null
        };
      }

      function plusEditorSnapshot() {
        const form = $("#plusTemplateForm");
        return form ? JSON.stringify([form.title.value, form.tags.value, form.template.value, state.plusDraft.fields]) : null;
      }

      function hasUnsavedChanges() {
        return Boolean($("#plusTemplateForm")) && plusEditorSnapshot() !== state.plusSavedDraft;
      }

      async function transitionTo(viewName, id, push = true) {
        if (hasUnsavedChanges() && !window.confirm("Ci sono modifiche non salvate. Vuoi uscire senza salvarle?")) {
          if (!push) history.pushState(null, "", `?view=${state.currentView}${state.editId ? `&id=${encodeURIComponent(state.editId)}` : ""}`);
          return;
        }
        view.classList.add("is-leaving");
        await new Promise(resolve => setTimeout(resolve, 170));
        if (push) setUrl(viewName, id);
        state.currentView = viewName;
        state.editId = id || null;
        await renderRoute(viewName, id);
        view.classList.remove("is-leaving");
      }

      function renderShell(_namespace, html) {
        view.innerHTML = html;
      }

      function noteStats() {
        const tagCount = new Set(state.notes.flatMap(note => note.tags || [])).size;
        return { total: state.notes.length, tags: tagCount };
      }

      function applyFilters() {
        const query = state.query.trim().toLowerCase();
        state.filtered = state.notes.filter(note => {
          const haystack = [note.title, note.text, ...(note.tags || [])].join(" ").toLowerCase();
          const matchesQuery = !query || haystack.includes(query);
          const matchesTag = !state.activeTag || (note.tags || []).includes(state.activeTag);
          return matchesQuery && matchesTag;
        });
      }

      function listTemplate() {
        const stats = noteStats();
        const allTags = Array.from(new Set(state.notes.flatMap(note => note.tags || []))).sort();
        return `
          <section class="hero">
            <div>
              <h2>Copia gli appunti senza aprire dettagli.</h2>
              <p>Ogni scheda mette il contenuto a portata di clic, con ricerca rapida e backup JSON quando serve.</p>
            </div>
            <div class="stats" aria-label="Statistiche appunti">
              <div class="stat"><b>${stats.total}</b><span>Appunti salvati</span></div>
              <div class="stat"><b>${stats.tags}</b><span>Tag attivi</span></div>
              <div class="stat"><b>1 clic</b><span>Copia del contenuto</span></div>
            </div>
          </section>

          <section class="toolbar" aria-label="Filtri appunti">
            <label class="sr-only" for="searchNotes">Cerca appunti</label>
            <input id="searchNotes" class="field" type="search" placeholder="Cerca per titolo, testo o tag" value="${escapeHtml(state.query)}" autocomplete="off" />
            <label class="sr-only" for="tagFilter">Filtra per tag</label>
            <select id="tagFilter" class="field">
              <option value="">Tutti i tag</option>
              ${allTags.map(tag => `<option value="${escapeHtml(tag)}" ${tag === state.activeTag ? "selected" : ""}>#${escapeHtml(tag)}</option>`).join("")}
            </select>
            ${state.notes.some(isPreset) ? `<button class="btn danger" id="deleteExamples" type="button">Elimina esempi</button>` : ""}
            <a class="btn primary" href="?view=new" data-route="new">Nuovo appunto</a>
          </section>

          <section id="notesRegion" class="notes-list" aria-label="Elenco appunti"></section>
          <div class="load-more" id="loadMoreWrap"></div>
        `;
      }

      function noteCard(note) {
        const tags = (note.tags || []).map(tag => `<span class="tag">#${escapeHtml(tag)}</span>`).join("");
        return `
          <article class="note-card" data-note-id="${escapeHtml(note.id)}" data-favorite="${Boolean(note.favorite)}" draggable="true">
            <div class="note-content" role="button" tabindex="0" aria-label="Copia appunto ${escapeHtml(note.title || "Senza titolo")}">
              <div class="note-title-row">
                <h3 class="note-title">${escapeHtml(note.title || "Senza titolo")}</h3>
                <time class="note-date" datetime="${escapeHtml(note.updatedAt)}">${formatDate(note.updatedAt)}</time>
              </div>
              <p class="note-preview">${escapeHtml(note.text)}</p>
              <div class="tags">${tags || '<span class="tag">senza tag</span>'}</div>
            </div>
            <div class="note-actions" aria-label="Azioni appunto">
              <button class="btn favorite${note.favorite ? " active" : ""}" type="button" data-action="favorite" aria-pressed="${Boolean(note.favorite)}">${note.favorite ? "★ Preferito" : "☆ Preferito"}</button>
              <button class="btn copy" type="button" data-action="copy">Copia veloce</button>
              <button class="btn" type="button" data-action="edit">Modifica</button>
              <button class="btn danger" type="button" data-action="delete">Elimina</button>
            </div>
          </article>
        `;
      }

      function renderNextNotes(reset = false) {
        const region = $("#notesRegion");
        const loadWrap = $("#loadMoreWrap");
        if (!region || !loadWrap) return;
        if (reset) {
          state.rendered = 0;
          region.innerHTML = "";
        }

        if (!state.filtered.length) {
          region.innerHTML = `
            <div class="panel empty-state">
              <h3>Nessun appunto trovato</h3>
              <p>Crea un appunto o modifica i filtri per tornare alla copia veloce.</p>
              <a class="btn primary" href="?view=new" data-route="new">Crea il primo appunto</a>
            </div>
          `;
          loadWrap.innerHTML = "";
          return;
        }

        const nextChunk = state.filtered.slice(state.rendered, state.rendered + PAGE_SIZE);
        region.insertAdjacentHTML("beforeend", nextChunk.map(noteCard).join(""));
        state.rendered += nextChunk.length;

        loadWrap.innerHTML = state.rendered < state.filtered.length
          ? `<button class="btn" type="button" id="loadMore">Mostra altri ${Math.min(PAGE_SIZE, state.filtered.length - state.rendered)} appunti</button>`
          : "";
      }

      async function renderList() {
        state.notes = await getAllNotes();
        applyFilters();
        renderShell("list", listTemplate());
        renderNextNotes(true);
      }

      function mergeDisplayedOrder(notes, ids) {
        const visible = new Set(ids);
        const ordered = ids.map(id => notes.find(note => note.id === id));
        let index = 0;
        return notes.map(note => visible.has(note.id) ? ordered[index++] : note);
      }

      console.assert(
        mergeDisplayedOrder([{ id: "a" }, { id: "x" }, { id: "b" }], ["b", "a"]).map(note => note.id).join("") === "bxa",
        "Riordino appunti non valido"
      );

      async function saveDisplayedOrder(ids) {
        state.notes = mergeDisplayedOrder(state.notes, ids);
        const store = tx("readwrite");
        await Promise.all(state.notes.map((note, order) => {
          note.order = order;
          return requestToPromise(store.put(note));
        }));
        applyFilters();
        await syncQuickPanelState();
      }

      async function saveDisplayedPlusOrder(ids) {
        state.plusTemplates = mergeDisplayedOrder(state.plusTemplates, ids);
        await Promise.all(state.plusTemplates.map((template, order) => {
          template.order = order;
          return savePlusTemplate(template);
        }));
        await syncQuickPanelState();
      }

      async function toggleNoteFavorite(id) {
        const note = await getNote(id);
        if (!note) return toast("Appunto non trovato.", "danger");
        note.favorite = !note.favorite;
        await saveNote(note);
        await renderList();
        await syncQuickPanelState();
      }

      async function togglePlusFavorite(id) {
        const template = await getPlusTemplate(id);
        if (!template) return toast("Modello non trovato.", "danger");
        template.favorite = !template.favorite;
        await savePlusTemplate(template);
        await renderTool();
        await syncQuickPanelState();
      }

      async function openNoteWindow(id) {
        const note = id ? await getNote(id) : null;
        if (id && !note) return toast("Appunto non trovato.", "danger");
        const existing = id && findAppWindow(`note:${id}`);
        if (existing) return focusAppWindow(existing);
        const title = note ? `Modifica: ${note.title || "Senza titolo"}` : "Nuovo appunto";
        const dialog = createAppWindow("note-window", note ? `note:${note.id}` : `note-new:${state.windowSeq + 1}`, title);
        const win = dialog.dataset.windowId;
        dialog.dataset.noteId = note ? note.id : "";
        dialog.innerHTML = `
          <form class="quick-dialog-form" data-note-form>
            ${windowTitlebar(`windowTitle-${win}`, title, "Trascina per spostare")}
            <div class="form-row">
              <label for="noteTitle-${win}">Titolo</label>
              <input class="field" id="noteTitle-${win}" name="title" maxlength="120" value="${escapeHtml(note && note.title)}" placeholder="Es. Risposta cliente, snippet email, comando ricorrente" required />
            </div>
            <div class="form-row">
              <label for="noteText-${win}">Testo dell'appunto</label>
              <textarea class="field" id="noteText-${win}" name="text" placeholder="Questo è il contenuto copiato dal pulsante Copia veloce." required>${escapeHtml(note && note.text)}</textarea>
              <small>Il pulsante Copia veloce copierà solo questo campo.</small>
            </div>
            <div class="form-row">
              <label for="noteTags-${win}">Tag</label>
              <input class="field" id="noteTags-${win}" name="tags" value="${escapeHtml(note && (note.tags || []).join(", "))}" placeholder="lavoro, personale, snippet" />
              <small>Separa i tag con una virgola.</small>
            </div>
            <div class="quick-dialog-actions">
              <button class="btn" type="button" data-window-close>Annulla</button>
              ${note ? `<button class="btn danger" type="button" data-note-delete>Elimina</button>` : ""}
              <button class="btn primary" type="submit">${note ? "Salva modifiche" : "Salva appunto"}</button>
            </div>
          </form>
        `;
        showAppWindow(dialog);
        $(`#noteText-${win}`, dialog).focus();
      }

      function backupTemplate() {
        return `
          <section class="hero">
            <div>
              <h2>Backup JSON.</h2>
              <p>Esporta o importa appunti senza cambiare archivio principale: i dati restano gestiti da IndexedDB.</p>
            </div>
          </section>
          <section class="backup-grid">
            <article class="panel backup-card">
              <h3>Esporta</h3>
              <p>Scarica un file JSON con tutti gli appunti, inclusi tag e date.</p>
              <button class="btn primary" id="exportJson" type="button">Scarica JSON</button>
            </article>
            <article class="panel backup-card">
              <h3>Importa</h3>
              <p>Carica un backup JSON. Gli appunti importati vengono aggiunti o aggiornati per ID.</p>
              <input class="field" id="importFile" type="file" accept="application/json,.json" />
            </article>
          </section>
        `;
      }

      function renderBackup() {
        renderShell("backup", backupTemplate());
      }

      function plusCard(template) {
        const tags = (template.tags || []).map(tag => `<span class="tag">#${escapeHtml(tag)}</span>`).join("");
        return `
          <article class="note-card plus-card" data-plus-id="${escapeHtml(template.id)}" data-favorite="${Boolean(template.favorite)}" draggable="true">
            <div class="note-content" role="button" tabindex="0" aria-label="Compila ${escapeHtml(template.title)}">
              <div class="note-title-row">
                <h3 class="note-title">${escapeHtml(template.title)}</h3>
                <time class="note-date" datetime="${escapeHtml(template.updatedAt)}">${formatDate(template.updatedAt)}</time>
              </div>
              <p class="note-preview">${escapeHtml(template.template)}</p>
              <div class="tags">${tags}<span class="tag">${template.fields.filter(field => field.kind === "manual").length} campi</span><span class="tag">${template.fields.filter(field => field.kind === "computed").length} calcoli</span></div>
            </div>
            <div class="note-actions" aria-label="Azioni Appunto Plus">
              <button class="btn favorite${template.favorite ? " active" : ""}" type="button" data-plus-action="favorite" aria-pressed="${Boolean(template.favorite)}">${template.favorite ? "★ Preferito" : "☆ Preferito"}</button>
              <button class="btn copy" type="button" data-plus-action="run">Compila</button>
              <button class="btn" type="button" data-plus-action="edit">Modifica</button>
              <button class="btn danger" type="button" data-plus-action="delete">Elimina</button>
            </div>
          </article>
        `;
      }

      function renderPlusCards() {
        const region = $("#plusRegion");
        if (!region) return;
        const query = state.plusQuery.trim().toLowerCase();
        const templates = state.plusTemplates.filter(template => {
          const matchesQuery = !query || [template.title, template.template, ...(template.tags || [])].join(" ").toLowerCase().includes(query);
          const matchesTag = !state.plusActiveTag || (template.tags || []).includes(state.plusActiveTag);
          return matchesQuery && matchesTag;
        });
        region.innerHTML = templates.length ? templates.map(plusCard).join("") : `
          <div class="panel empty-state">
            <h3>${state.plusTemplates.length ? "Nessun modello trovato" : "Nessun modello"}</h3>
            <p>${state.plusTemplates.length ? "Modifica la ricerca o il filtro tag." : "Crea il primo Appunto Plus per generare testi compilabili."}</p>
            <a class="btn primary" href="?view=plus-new" data-route="plus-new">Crea modello</a>
          </div>
        `;
      }

      async function renderTool() {
        state.plusTemplates = await getAllPlusTemplates();
        const allTags = Array.from(new Set(state.plusTemplates.flatMap(template => template.tags || []))).sort();
        renderShell("tool", `
          <section class="hero">
            <div>
              <h2>Crea testi pronti senza rifare i calcoli.</h2>
              <p>Ogni modello compila i campi, applica le operazioni e prepara il testo finale da copiare.</p>
            </div>
            <div class="stats" aria-label="Statistiche Appunti Plus">
              <div class="stat"><b>${state.plusTemplates.length}</b><span>Appunti salvati</span></div>
              <div class="stat"><b>${allTags.length}</b><span>Tag attivi</span></div>
              <div class="stat"><b>2 passi</b><span>Genera e copia</span></div>
            </div>
          </section>
          <section class="toolbar" aria-label="Filtri Appunti Plus">
            <label class="sr-only" for="searchPlus">Cerca Appunti Plus</label>
            <input id="searchPlus" class="field" type="search" placeholder="Cerca per titolo, testo o tag" value="${escapeHtml(state.plusQuery)}" autocomplete="off" />
            <label class="sr-only" for="plusTagFilter">Filtra per tag</label>
            <select id="plusTagFilter" class="field">
              <option value="">Tutti i tag</option>
              ${allTags.map(tag => `<option value="${escapeHtml(tag)}" ${tag === state.plusActiveTag ? "selected" : ""}>#${escapeHtml(tag)}</option>`).join("")}
            </select>
            <div class="plus-actions">
              <button class="btn${state.plusUltra ? " primary" : ""}" id="togglePlusUltra" type="button" aria-pressed="${state.plusUltra}">Ultra rapida: ${state.plusUltra ? "ON" : "OFF"}</button>
              ${state.plusTemplates.some(isPreset) ? `<button class="btn danger" id="deleteExamples" type="button">Elimina esempi</button>` : ""}
              <a class="btn" href="?view=plus-backup" data-route="plus-backup">Import / export</a>
              <a class="btn primary" href="?view=plus-new" data-route="plus-new">Nuovo modello</a>
            </div>
          </section>
          <div class="plus-ultra-status" id="plusUltraStatus" role="status" hidden></div>
          <section id="plusRegion" class="notes-list" aria-label="Elenco Appunti Plus"></section>
        `);
        renderPlusCards();
        if (state.plusUltra) setPlusUltraStatus("Modalità ultra rapida attiva: scegli una scheda per elaborare il contenuto degli appunti.");
      }

      function operationOptions(selected = "") {
        return `<option value="">Scegli operazione</option>${Object.entries(PLUS_OPERATIONS).map(([value, label]) => `<option value="${value}" ${selected === value ? "selected" : ""}>${label}</option>`).join("")}`;
      }

      function sourceOptions(selected = "") {
        const manualFields = (state.plusDraft?.fields || []).filter(field => field.kind === "manual" && field.inputType !== "checkbox");
        return `<option value="">Scegli campo</option>${manualFields.map(field => `<option value="${escapeHtml(field.name)}" ${selected === field.name ? "selected" : ""}>{${escapeHtml(field.name)}}</option>`).join("")}`;
      }

      function renderPlusFieldConfigs() {
        const container = $("#placeholderConfigs");
        if (!container || !state.plusDraft) return;
        const expanded = container.querySelector(".placeholder-config[open]")?.dataset.fieldName;
        container.innerHTML = state.plusDraft.fields.length ? state.plusDraft.fields.map(field => {
          const target = field.kind === "computed" ? `computed:${field.name}` : `field:${field.name}`;
          const extractionTarget = `extract:${field.name}`;
          return `
            <details class="placeholder-config" name="field-properties" data-field-name="${escapeHtml(field.name)}" ${field.name === (state.plusSelectedField || expanded || state.plusDraft.fields[0]?.name) ? "open" : ""}>
              <summary><code>${field.kind === "computed" ? `%${escapeHtml(field.name)}%` : `{${escapeHtml(field.name)}}`}</code><span>${field.kind === "computed" ? "Calcolo" : field.inputType === "checkbox" ? "Checkbox" : field.required === false ? "Facoltativo" : "Obbligatorio"}</span></summary>
              <div class="field-properties">
              ${field.kind === "manual" ? `
                <div class="form-row">
                  <label for="plusType-${escapeHtml(field.name)}">Tipo di inserimento</label>
                  <select class="field" id="plusType-${escapeHtml(field.name)}" data-field-type="${escapeHtml(field.name)}" data-validation-target="${escapeHtml(target)}">
                    <option value="text" ${field.inputType === "text" ? "selected" : ""}>Riga singola</option>
                    <option value="textarea" ${field.inputType === "textarea" ? "selected" : ""}>Testo multilinea</option>
                    <option value="checkbox" ${field.inputType === "checkbox" ? "selected" : ""}>Checkbox · testo fisso</option>
                  </select>
                  <div class="field-error" data-error-for="${escapeHtml(target)}"></div>
                </div>
                ${field.inputType === "checkbox" ? `
                  <div class="form-row">
                    <label for="plusLabel-${escapeHtml(field.name)}">Etichetta della checkbox</label>
                    <input class="field" id="plusLabel-${escapeHtml(field.name)}" data-field-label="${escapeHtml(field.name)}" value="${escapeHtml(field.label || "")}" placeholder="es. Includi gli allegati" />
                    <label for="plusCheckedText-${escapeHtml(field.name)}">Testo da inserire se selezionata</label>
                    <textarea class="field" id="plusCheckedText-${escapeHtml(field.name)}" data-field-checked-text="${escapeHtml(field.name)}">${escapeHtml(field.checkedText || "")}</textarea>
                    <small>La checkbox parte deselezionata a ogni nuova compilazione.</small>
                  </div>
                ` : `
                  <label class="check-row"><input type="checkbox" data-field-required="${escapeHtml(field.name)}" ${field.required !== false ? "checked" : ""} /> Obbligatorio</label>
                  <small>Se facoltativo e vuoto, il campo e i risultati dipendenti vengono omessi.</small>
                `}
                <details class="advanced-options" ${field.inputType === "checkbox" ? "hidden" : ""}>
                <summary>Opzioni avanzate</summary>
                <div class="field-properties">
                <div class="form-row" data-line-prefix-row ${field.inputType === "textarea" ? "" : "hidden"}>
                  <label for="plusLinePrefix-${escapeHtml(field.name)}">Testo prima di ogni riga (facoltativo)</label>
                  <input class="field" id="plusLinePrefix-${escapeHtml(field.name)}" data-field-line-prefix="${escapeHtml(field.name)}" value="${escapeHtml(field.linePrefix || "")}" placeholder="es. • oppure Voce: " autocomplete="off" />
                  <small>Aggiunto a ogni riga non vuota nel risultato. Includi uno spazio finale se serve; lascia vuoto per non aggiungere testo.</small>
                </div>
                <div class="form-row" data-multiline-instructions-row ${field.inputType === "textarea" ? "" : "hidden"}>
                  <label for="plusListInstructions-${escapeHtml(field.name)}">Indicazioni per manipolare la lista (facoltative)</label>
                  <textarea class="field plus-list-instructions" id="plusListInstructions-${escapeHtml(field.name)}" data-field-list-instructions="${escapeHtml(field.name)}" placeholder="es. Controlla le date, elimina le righe duplicate e uniforma gli importi.">${escapeHtml(field.listInstructions || "")}</textarea>
                  <small>Le indicazioni appariranno nella finestra di compilazione. Il testo finale potrà essere modificato direttamente nell’anteprima prima di copiarlo.</small>
                </div>
                <div class="form-row multiline-transform" data-multiline-transform-row ${field.inputType === "textarea" ? "" : "hidden"}>
                  <strong>Trasformazione automatica di ogni riga (facoltativa)</strong>
                  <label for="plusLineInputPattern-${escapeHtml(field.name)}">Formato previsto dell’input</label>
                  <input class="field" id="plusLineInputPattern-${escapeHtml(field.name)}" data-field-line-input-pattern="${escapeHtml(field.name)}" data-validation-target="${escapeHtml(`transform:${field.name}`)}" value="${escapeHtml(field.lineInputPattern || "")}" placeholder="Fat. n. %numero_fattura% del %data% E %euro%" autocomplete="off" />
                  <label for="plusLineOutputPattern-${escapeHtml(field.name)}">Formato della riga in uscita</label>
                  <input class="field" id="plusLineOutputPattern-${escapeHtml(field.name)}" data-field-line-output-pattern="${escapeHtml(field.name)}" value="${escapeHtml(field.lineOutputPattern || "")}" placeholder="Fat. n. %numero_fattura% DEL %data% (Euro %euro%)" autocomplete="off" />
                  <small>Usa gli stessi segnaposto %nome% nei due formati. Gli spazi dell’input possono variare; ogni riga non conforme verrà segnalata.</small>
                  <div class="field-error" data-error-for="${escapeHtml(`transform:${field.name}`)}"></div>
                </div>
                <div class="form-row">
                  <label for="plusExtraction-${escapeHtml(field.name)}">
                    <input id="plusExtraction-${escapeHtml(field.name)}" type="checkbox" data-field-extraction="${escapeHtml(field.name)}" ${field.extraction ? "checked" : ""} />
                    Estrai una parola per prefisso
                  </label>
                </div>
                ${field.extraction ? `
                  <div class="form-row">
                    <label for="plusExtractPrefix-${escapeHtml(field.name)}">Prefisso</label>
                    <input class="field" id="plusExtractPrefix-${escapeHtml(field.name)}" data-field-extract-prefix="${escapeHtml(field.name)}" data-validation-target="${escapeHtml(extractionTarget)}" value="${escapeHtml(field.extraction.prefix)}" placeholder="es. A00" autocomplete="off" />
                    <label for="plusExtractName-${escapeHtml(field.name)}">Nome placeholder estratto</label>
                    <input class="field" id="plusExtractName-${escapeHtml(field.name)}" data-field-extract-name="${escapeHtml(field.name)}" value="${escapeHtml(field.extraction.name)}" placeholder="es. riferimento" autocomplete="off" />
                    <button class="btn" type="button" data-insert-extraction="${escapeHtml(field.name)}">Inserisci nel testo</button>
                    <div class="field-error" data-error-for="${escapeHtml(extractionTarget)}"></div>
                  </div>
                ` : ""}
                </div></details>
              ` : `
                <div class="form-row">
                  <label for="plusOperation-${escapeHtml(field.name)}">Operazione</label>
                  <select class="field" id="plusOperation-${escapeHtml(field.name)}" data-field-operation="${escapeHtml(field.name)}" data-validation-target="${escapeHtml(target)}">${operationOptions(field.operation)}</select>
                  <label for="plusSource-${escapeHtml(field.name)}">Campo sorgente</label>
                  <select class="field" id="plusSource-${escapeHtml(field.name)}" data-field-source="${escapeHtml(field.name)}">${sourceOptions(field.source)}</select>
                  <small>Usa il numero finale di ogni riga.</small>
                  <div class="field-error" data-error-for="${escapeHtml(target)}"></div>
                </div>
              `}
              <button class="btn danger" type="button" data-remove-placeholder="${escapeHtml(field.name)}">Rimuovi campo</button>
              </div>
            </details>
          `;
        }).join("") : "<small>Nessun placeholder configurato.</small>";
        state.plusSelectedField = null;
      }

      function plusFormTemplate(template) {
        const isEdit = Boolean(template);
        return `
          <section class="hero">
            <div>
              <h2>${isEdit ? "Modifica modello." : "Nuovo Appunto Plus."}</h2>
              <p>Inserisci i placeholder con il pulsante: gli errori vengono mostrati prima del salvataggio.</p>
            </div>
          </section>
          <form class="panel form-grid plus-editor" id="plusTemplateForm" novalidate>
            <div class="error-summary" id="plusErrorSummary" role="alert" tabindex="-1" hidden></div>
            <div class="editor-main">
            <div class="editor-meta">
            <div class="form-row">
              <label for="plusTitle">Titolo</label>
              <input class="field" id="plusTitle" name="title" maxlength="120" value="${escapeHtml(template && template.title)}" data-validation-target="plusTitle" required />
              <div class="field-error" data-error-for="plusTitle"></div>
            </div>
            <div class="form-row">
              <label for="plusTags">Tag</label>
              <input class="field" id="plusTags" name="tags" value="${escapeHtml(template && (template.tags || []).join(", "))}" placeholder="lavoro, fatture, clienti" />
              <small>Separa i tag con una virgola.</small>
            </div>
            </div>
            <div class="form-row editor-text">
              <label for="plusTemplate">Testo del modello</label>
              <textarea class="field" id="plusTemplate" name="template" data-validation-target="plusTemplate" placeholder="Lista spesa: %totale%&#10;{lista}" required>${escapeHtml(template && template.template)}</textarea>
              <div class="placeholder-tools">
                <button class="btn" id="showPlaceholderBuilder" type="button">Inserisci campo</button>
                <small>Il placeholder verrà inserito nel punto del cursore.</small>
              </div>
              <div class="field-error" data-error-for="plusTemplate"></div>
            </div>
            <section class="placeholder-builder" id="placeholderBuilder" aria-label="Nuovo placeholder" hidden>
              <div class="form-row">
                <label for="placeholderName">Nome</label>
                <input class="field" id="placeholderName" placeholder="es. lista o totale" autocomplete="off" />
              </div>
              <div class="form-row">
                <label for="placeholderKind">Tipo</label>
                <select class="field" id="placeholderKind">
                  <option value="manual">Campo manuale</option>
                  <option value="computed">Valore calcolato</option>
                </select>
              </div>
              <div class="form-row" id="builderInputTypeRow">
                <label for="placeholderInputType">Inserimento</label>
                <select class="field" id="placeholderInputType"><option value="text">Riga singola</option><option value="textarea">Testo multilinea</option><option value="checkbox">Checkbox · testo fisso</option></select>
              </div>
              <div class="form-row" id="builderCalculationRow" hidden>
                <label for="placeholderOperation">Operazione</label>
                <select class="field" id="placeholderOperation">${operationOptions()}</select>
                <label for="placeholderSource">Campo sorgente</label>
                <select class="field" id="placeholderSource">${sourceOptions()}</select>
              </div>
              <div class="field-error" id="placeholderBuilderError" role="alert"></div>
              <div class="plus-actions">
                <button class="btn primary" id="insertPlaceholder" type="button">Inserisci</button>
                <button class="btn" id="cancelPlaceholder" type="button">Annulla</button>
              </div>
            </section>
            </div>
            <aside class="editor-sidebar">
              <h3>Campi del modello</h3>
              <p class="muted">Seleziona un campo per modificarne le proprietà.</p>
              <section class="placeholder-configs" id="placeholderConfigs"></section>
            </aside>
            <div class="form-actions">
              <a class="btn" href="?view=tool" data-route="tool">Annulla</a>
              <button class="btn primary" type="submit">Salva modello</button>
            </div>
          </form>
        `;
      }

      async function renderPlusForm(id) {
        const template = id ? await getPlusTemplate(id) : null;
        if (id && !template) {
          toast("Modello non trovato.", "danger");
          return transitionTo("tool", null, true);
        }
        state.plusDraft = template
          ? { ...template, fields: structuredClone(template.fields), lastValues: { ...(template.lastValues || {}) } }
          : { fields: [], lastValues: {} };
        renderShell(id ? "plus-edit" : "plus-new", plusFormTemplate(template));
        renderPlusFieldConfigs();
        validatePlusEditor();
        state.plusSavedDraft = plusEditorSnapshot();
        $("#plusTitle").focus();
      }

      function renderPlusConfigErrors(errors, focusSummary = false) {
        $$('[data-validation-target]').forEach(field => {
          field.removeAttribute("aria-invalid");
          field.removeAttribute("aria-describedby");
        });
        $$('[data-error-for]').forEach(error => { error.textContent = ""; error.removeAttribute("id"); });

        const grouped = new Map();
        errors.forEach(error => grouped.set(error.target, [...(grouped.get(error.target) || []), error.message]));
        let errorIndex = 0;
        grouped.forEach((messages, target) => {
          const field = $$('[data-validation-target]').find(item => item.dataset.validationTarget === target);
          const detail = $$('[data-error-for]').find(item => item.dataset.errorFor === target);
          if (field) field.setAttribute("aria-invalid", "true");
          if (detail) {
            detail.id = `plusFieldError-${errorIndex++}`;
            detail.textContent = messages.join(" ");
            if (field) field.setAttribute("aria-describedby", detail.id);
          }
        });

        const summary = $("#plusErrorSummary");
        if (!summary) return;
        summary.hidden = !errors.length;
        summary.innerHTML = errors.length ? `<strong>Correggi questi problemi:</strong><ul>${errors.map(error => `<li><button type="button" data-error-target="${escapeHtml(error.target)}">${escapeHtml(error.message)}</button></li>`).join("")}</ul>` : "";
        if (errors.length && focusSummary) summary.focus();
      }

      function validatePlusEditor(focusSummary = false) {
        const form = $("#plusTemplateForm");
        if (!form || !state.plusDraft) return [];
        state.plusDraft.title = form.title.value;
        state.plusDraft.template = form.template.value;
        const errors = validatePlusConfig(form.title.value, form.template.value, state.plusDraft.fields);
        renderPlusConfigErrors(errors, focusSummary);
        return errors;
      }

      function insertPlusPlaceholder() {
        const name = $("#placeholderName").value.trim();
        const kind = $("#placeholderKind").value;
        const error = $("#placeholderBuilderError");
        if (!PLACEHOLDER_NAME.test(name)) {
          error.textContent = "Usa un nome che inizi con una lettera e contenga solo lettere, numeri o _.";
          $("#placeholderName").focus();
          return;
        }
        if (state.plusDraft.fields.some(field => field.name === name || field.extraction?.name === name)) {
          error.textContent = `Il nome “${name}” è già utilizzato.`;
          $("#placeholderName").focus();
          return;
        }
        if (kind === "computed" && (!$("#placeholderOperation").value || !$("#placeholderSource").value)) {
          error.textContent = "Scegli un’operazione e un campo manuale sorgente.";
          return;
        }

        const textarea = $("#plusTemplate");
        const cursor = state.plusCursor || { start: textarea.selectionStart, end: textarea.selectionEnd };
        const token = kind === "manual" ? `{${name}}` : `%${name}%`;
        textarea.value = textarea.value.slice(0, cursor.start) + token + textarea.value.slice(cursor.end);
        state.plusDraft.fields.push(kind === "manual"
          ? normalizePlusField({ name, kind, inputType: $("#placeholderInputType").value })
          : { name, kind, operation: $("#placeholderOperation").value, source: $("#placeholderSource").value });
        state.plusSelectedField = name;
        renderPlusFieldConfigs();
        $("#placeholderBuilder").hidden = true;
        $("#placeholderName").value = "";
        $("#placeholderOperation").value = "";
        error.textContent = "";
        state.plusCursor = null;
        validatePlusEditor();
        textarea.focus();
        textarea.setSelectionRange(cursor.start + token.length, cursor.start + token.length);
      }

      function removePlusPlaceholder(name) {
        const field = state.plusDraft.fields.find(item => item.name === name);
        if (!field) return;
        const textarea = $("#plusTemplate");
        const token = field.kind === "manual" ? `{${name}}` : `%${name}%`;
        textarea.value = textarea.value.split(token).join("");
        if (field.extraction) textarea.value = textarea.value.split(`%${field.extraction.name}%`).join("");
        state.plusDraft.fields = state.plusDraft.fields.filter(item => item.name !== name);
        renderPlusFieldConfigs();
        validatePlusEditor();
      }

      function insertExtractionPlaceholder(fieldName) {
        const field = state.plusDraft.fields.find(item => item.name === fieldName && item.kind === "manual");
        if (!field?.extraction || !PLACEHOLDER_NAME.test(field.extraction.name)) return validatePlusEditor(true);
        const textarea = $("#plusTemplate");
        const token = `%${field.extraction.name}%`;
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        textarea.value = textarea.value.slice(0, start) + token + textarea.value.slice(end);
        validatePlusEditor();
        textarea.focus();
        textarea.setSelectionRange(start + token.length, start + token.length);
      }

      async function handlePlusSubmit(form) {
        const errors = validatePlusEditor(true);
        if (errors.length) return;
        const now = new Date().toISOString();
        const existing = state.editId ? await getPlusTemplate(state.editId) : null;
        const savedSnapshot = plusEditorSnapshot();
        await savePlusTemplate({
          id: existing ? existing.id : uid(),
          title: form.title.value.trim(),
          template: form.template.value.trim(),
          tags: parseTags(form.tags.value),
          fields: state.plusDraft.fields.map(cleanPlusField),
          lastValues: existing ? (existing.lastValues || {}) : {},
          favorite: Boolean(existing?.favorite),
          order: existing
            ? (existing.order ?? state.plusTemplates.find(item => item.id === existing.id)?.order ?? 0)
            : state.plusTemplates.reduce((min, item) => Math.min(min, item.order), 0) - 1,
          createdAt: existing ? existing.createdAt : now,
          updatedAt: now
        });
        await syncQuickPanelState();
        toast(existing ? "Modello aggiornato." : "Modello creato.", "success");
        state.plusSavedDraft = savedSnapshot;
        state.plusQuery = "";
        state.plusActiveTag = "";
        await transitionTo("tool", null, true);
      }

      async function confirmDeletePlus(id) {
        const template = await getPlusTemplate(id);
        if (!template) return toast("Modello non trovato.", "danger");
        if (!window.confirm(`Eliminare “${template.title}”?`)) return;
        await deletePlusTemplate(id);
        await syncQuickPanelState();
        closeAppWindow(findAppWindow(`plus:${id}`));
        toast("Modello eliminato.", "danger");
        await transitionTo("tool", null, true);
      }

      // Finestre interne alla pagina: non modali, riducibili a icona nella barra in basso.
      const appWindows = () => $$("#windowLayer > .app-window");
      const findAppWindow = key => appWindows().find(item => item.dataset.windowKey === key);

      function windowTitlebar(titleId, title, hint) {
        return `
          <header class="plus-dialog-titlebar window-titlebar">
            <h2 id="${titleId}">${escapeHtml(title)}</h2>
            <small>${hint}</small>
            <div class="window-controls">
              <button class="window-control" type="button" data-window-minimize aria-label="Riduci a icona" title="Riduci a icona">–</button>
              <button class="window-control close" type="button" data-window-close aria-label="Chiudi" title="Chiudi">×</button>
            </div>
          </header>`;
      }

      function createAppWindow(className, key, title) {
        const dialog = document.createElement("dialog");
        state.windowSeq += 1;
        dialog.className = `quick-dialog app-window ${className}`;
        dialog.dataset.windowId = String(state.windowSeq);
        dialog.dataset.windowKey = key;
        dialog.dataset.windowTitle = title;
        dialog.setAttribute("aria-labelledby", `windowTitle-${state.windowSeq}`);
        return dialog;
      }

      function showAppWindow(dialog) {
        const offset = (appWindows().length % 8) * 28;
        $("#windowLayer").append(dialog);
        dialog.show();
        enableMovableWindow(dialog);
        const rect = dialog.getBoundingClientRect();
        dialog.style.left = `${Math.max(0, Math.min(window.innerWidth - rect.width, (window.innerWidth - rect.width) / 2 + offset))}px`;
        dialog.style.top = `${Math.max(0, Math.min(window.innerHeight - rect.height, (window.innerHeight - rect.height) / 2 + offset))}px`;
        focusAppWindow(dialog);
      }

      function focusAppWindow(dialog) {
        dialog.hidden = false;
        appWindows().forEach(item => item.classList.toggle("is-active", item === dialog));
        state.windowZ += 1;
        dialog.style.zIndex = String(state.windowZ);
        if (!dialog.contains(document.activeElement)) $("[data-plus-value], .field", dialog)?.focus();
        renderTaskbar();
      }

      function focusTopWindow() {
        const top = appWindows().filter(item => !item.hidden).sort((a, b) => Number(b.style.zIndex) - Number(a.style.zIndex))[0];
        if (top) focusAppWindow(top);
        else renderTaskbar();
      }

      function minimizeAppWindow(dialog) {
        dialog.hidden = true;
        dialog.classList.remove("is-active");
        focusTopWindow();
      }

      function closeAppWindow(dialog) {
        if (!dialog) return;
        dialog.close();
        dialog.remove();
        focusTopWindow();
      }

      function renderTaskbar() {
        const taskbar = $("#taskbar");
        if (!taskbar) return;
        const windows = appWindows();
        taskbar.hidden = !windows.length;
        taskbar.innerHTML = windows.map(item => `
          <button class="taskbar-item${item.classList.contains("is-active") ? " active" : ""}${item.hidden ? " minimized" : ""}" type="button" data-window-target="${item.dataset.windowId}" aria-pressed="${item.classList.contains("is-active")}" title="${escapeHtml(item.dataset.windowTitle)}">${escapeHtml(item.dataset.windowTitle)}</button>
        `).join("");
      }

      function enableMovableWindow(dialog) {
        const handle = $(".window-titlebar", dialog);
        if (!handle) return;
        let drag = null;

        handle.addEventListener("pointerdown", event => {
          if (event.button !== 0 || event.target.closest("button")) return;
          const rect = dialog.getBoundingClientRect();
          dialog.style.left = `${rect.left}px`;
          dialog.style.top = `${rect.top}px`;
          dialog.style.margin = "0";
          drag = { pointerId: event.pointerId, offsetX: event.clientX - rect.left, offsetY: event.clientY - rect.top };
          handle.setPointerCapture(event.pointerId);
          dialog.classList.add("moving");
          event.preventDefault();
        });

        handle.addEventListener("pointermove", event => {
          if (!drag || event.pointerId !== drag.pointerId) return;
          const rect = dialog.getBoundingClientRect();
          const maxLeft = Math.max(0, window.innerWidth - rect.width);
          const maxTop = Math.max(0, window.innerHeight - rect.height);
          dialog.style.left = `${Math.min(maxLeft, Math.max(0, event.clientX - drag.offsetX))}px`;
          dialog.style.top = `${Math.min(maxTop, Math.max(0, event.clientY - drag.offsetY))}px`;
        });

        const stopDragging = event => {
          if (!drag || event.pointerId !== drag.pointerId) return;
          if (handle.hasPointerCapture(event.pointerId)) handle.releasePointerCapture(event.pointerId);
          drag = null;
          dialog.classList.remove("moving");
        };
        handle.addEventListener("pointerup", stopDragging);
        handle.addEventListener("pointercancel", stopDragging);
      }

      function renderPlusRunErrors(dialog, errors) {
        $$('[data-plus-value]', dialog).forEach(field => {
          field.removeAttribute("aria-invalid");
          field.removeAttribute("aria-describedby");
        });
        $$('[data-run-error-for]', dialog).forEach(detail => { detail.textContent = ""; });
        const valueErrors = new Map();
        errors.filter(error => error.target.startsWith("value:")).forEach(error => {
          const name = error.target.slice(6);
          valueErrors.set(name, [...(valueErrors.get(name) || []), error.message]);
        });
        valueErrors.forEach((messages, name) => {
          const field = $$('[data-plus-value]', dialog).find(item => item.dataset.plusValue === name);
          const detail = $$('[data-run-error-for]', dialog).find(item => item.dataset.runErrorFor === name);
          if (field) {
            field.setAttribute("aria-invalid", "true");
            field.setAttribute("aria-describedby", `plusRunError-${dialog.dataset.windowId}-${name}`);
          }
          if (detail) detail.textContent = messages.join(" ");
        });
        const summaryErrors = errors.filter(error => !error.target.startsWith("value:"));
        const summary = $("[data-plus-run-errors]", dialog);
        summary.hidden = !summaryErrors.length;
        summary.innerHTML = summaryErrors.length ? `<strong>Impossibile calcolare il testo:</strong><ul>${summaryErrors.map(error => `<li>${escapeHtml(error.message)}</li>`).join("")}</ul>` : "";
      }

      function setPlusUltraStatus(message, tone = "") {
        const status = $("#plusUltraStatus");
        if (!status) return;
        status.hidden = !message;
        status.className = `plus-ultra-status${tone ? ` ${tone}` : ""}`;
        status.setAttribute("role", tone === "error" ? "alert" : "status");
        status.textContent = message;
      }

      async function runPlusUltra(id) {
        const template = state.plusTemplates.find(item => item.id === id);
        if (!template) return toast("Modello non trovato.", "danger");
        const configErrors = validatePlusConfig(template.title, template.template, template.fields || []);
        const manualFields = template.fields.filter(field => field.kind === "manual");
        if (configErrors.length || manualFields.length !== 1) {
          setPlusUltraStatus(configErrors.length
            ? `Scheda non utilizzabile: ${configErrors.map(error => error.message).join(" ")}`
            : "La modalità ultra rapida richiede una scheda con un solo campo manuale.", "error");
          return;
        }

        setPlusUltraStatus("Lettura e verifica degli appunti in corso…");
        try {
          if (!navigator.clipboard?.readText) throw new Error("Lettura degli appunti non disponibile in questo browser.");
          const source = (await navigator.clipboard.readText()).trim();
          if (!source) throw new Error("Gli appunti sono vuoti.");
          const result = buildPlusOutput(template.template, template.fields, { [manualFields[0].name]: source });
          const issues = [...result.errors.map(error => error.message), ...result.warnings];
          if (issues.length) {
            setPlusUltraStatus(`Contenuto non conforme: ${issues.join(" ")}`, "error");
            return;
          }
          await copyText(result.output);
          setPlusUltraStatus("Elaborazione completata: il testo corretto è stato copiato negli appunti.", "success");
          toast("Testo elaborato e copiato negli appunti.", "success");
        } catch (error) {
          setPlusUltraStatus(error?.message || "Impossibile leggere gli appunti.", "error");
        }
      }

      async function runPlusTemplate(id) {
        if (state.plusUltra && !state.plusTemplates.find(item => item.id === id)?.fields.some(field => field.inputType === "checkbox")) return runPlusUltra(id);
        openPlusDialog(id);
      }

      function openPlusDialog(id) {
        const template = state.plusTemplates.find(item => item.id === id);
        if (!template) return toast("Modello non trovato.", "danger");
        const existing = findAppWindow(`plus:${id}`);
        if (existing) return focusAppWindow(existing);
        const title = template.title || "Compila modello";
        const dialog = createAppWindow("plus-run-dialog", `plus:${id}`, title);
        const win = dialog.dataset.windowId;
        dialog.dataset.plusId = id;
        dialog.innerHTML = `
          <form class="quick-dialog-form" data-plus-run-form novalidate>
            ${windowTitlebar(`windowTitle-${win}`, title, "Trascina per spostare · usa l’angolo in basso a destra per ridimensionare")}
            <div class="quick-plus-fields" data-plus-run-fields>${template.fields.filter(field => field.kind === "manual").map(field => `
              <div class="form-row">
                <label for="plusValue-${win}-${escapeHtml(field.name)}">${escapeHtml(field.inputType === "checkbox" ? field.label || field.name : field.name)}${field.inputType !== "checkbox" && field.required === false ? " · facoltativo" : ""}</label>
                ${field.inputType === "checkbox"
                  ? `<input type="checkbox" id="plusValue-${win}-${escapeHtml(field.name)}" data-plus-value="${escapeHtml(field.name)}" /><small>${escapeHtml(field.checkedText)}</small>`
                  : field.inputType === "textarea"
                  ? `<textarea class="field" id="plusValue-${win}-${escapeHtml(field.name)}" data-plus-value="${escapeHtml(field.name)}" ${field.required !== false ? "required" : ""}></textarea>
                    <small class="field-resize-hint">Per cambiare l’altezza, trascina su o giù l’angolo rigato in basso a destra.</small>`
                  : `<input class="field" id="plusValue-${win}-${escapeHtml(field.name)}" data-plus-value="${escapeHtml(field.name)}" ${field.required !== false ? "required" : ""} />`}
                ${field.inputType === "textarea" && field.lineInputPattern && field.lineOutputPattern
                  ? `<aside class="list-instructions"><strong>Trasformazione automatica</strong><span>Input: ${escapeHtml(field.lineInputPattern)}\nOutput: ${escapeHtml(field.lineOutputPattern)}</span></aside>`
                  : ""}
                ${field.inputType === "textarea" && field.listInstructions
                  ? `<aside class="list-instructions"><strong>Indicazioni per la lista</strong><span>${escapeHtml(field.listInstructions)}</span></aside>`
                  : ""}
                <div class="field-error" id="plusRunError-${win}-${escapeHtml(field.name)}" data-run-error-for="${escapeHtml(field.name)}"></div>
              </div>
            `).join("")}</div>
            <div class="error-summary" data-plus-run-errors role="alert" hidden></div>
            <div class="warning-box" data-plus-run-warnings role="status" hidden></div>
            <section class="plus-dialog-result" data-plus-run-result aria-labelledby="plusRunResultTitle-${win}">
              <h3 id="plusRunResultTitle-${win}">Anteprima</h3>
              <small>Puoi modificare il testo qui sotto; il pulsante Copia userà la versione modificata.</small>
              <textarea class="field plus-preview quick-plus-preview" data-plus-preview aria-label="Testo finale modificabile" aria-live="polite" placeholder="Compila i campi e premi Genera per vedere il risultato."></textarea>
            </section>
            <div class="quick-dialog-actions">
              <button class="btn" type="button" data-window-close>Chiudi</button>
              <button class="btn copy" type="button" data-plus-copy disabled>Copia</button>
              <button class="btn primary" type="submit" data-plus-submit>Genera</button>
            </div>
          </form>
        `;

        const configErrors = validatePlusConfig(template.title, template.template, template.fields || []);
        if (configErrors.length) {
          const summary = $("[data-plus-run-errors]", dialog);
          summary.hidden = false;
          summary.innerHTML = `<strong>Il modello contiene errori:</strong><ul>${configErrors.map(error => `<li>${escapeHtml(error.message)}</li>`).join("")}</ul>`;
          $("[data-plus-submit]", dialog).disabled = true;
        }
        // Invio genera solo nella finestra in cui si sta scrivendo.
        $("[data-plus-run-form]", dialog).addEventListener("keydown", event => {
          const field = event.target.closest("[data-plus-value]");
          const submit = $("[data-plus-submit]", dialog);
          if (!field || event.key !== "Enter" || event.isComposing || submit.disabled || (field.matches("textarea") && event.shiftKey)) return;
          event.preventDefault();
          event.currentTarget.requestSubmit(submit);
        });
        showAppWindow(dialog);
      }

      async function submitPlusDialog(dialog) {
        const template = state.plusTemplates.find(item => item.id === dialog.dataset.plusId);
        if (!template) return toast("Modello non trovato.", "danger");
        const fields = $$('[data-plus-value]', dialog);
        const values = Object.fromEntries(fields.map(field => [field.dataset.plusValue, field.type === "checkbox" ? field.checked : field.value]));
        const result = buildPlusOutput(template.template, template.fields, values);
        renderPlusRunErrors(dialog, result.errors);

        const warning = $("[data-plus-run-warnings]", dialog);
        warning.hidden = !result.warnings.length;
        warning.innerHTML = result.warnings.length ? `<strong>Alcune righe non sono state elaborate:</strong><ul>${result.warnings.map(item => `<li>${escapeHtml(item)}</li>`).join("")}</ul>` : "";
        if (result.errors.length) {
          $("[data-plus-run-result]", dialog).hidden = true;
          $("[data-plus-copy]", dialog).disabled = true;
          return;
        }

        $("[data-plus-preview]", dialog).value = result.output;
        $("[data-plus-run-result]", dialog).hidden = false;
        $("[data-plus-copy]", dialog).disabled = false;
        await copyText(result.output);
        fields.forEach(field => {
          if (field.type === "checkbox") field.checked = false;
          else field.value = "";
        });
        fields[0]?.focus();
        toast("Testo generato e copiato negli appunti.", "success");
      }

      async function exportPlusJson() {
        const templates = (await getAllPlusTemplates()).map(({ lastValues, ...template }) => template);
        const payload = { app: "Appunti Plus", appVersion: "release v2.6", version: 3, exportedAt: new Date().toISOString(), templates };
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = "appunti-plus-backup.json";
        link.click();
        URL.revokeObjectURL(url);
        toast("Backup Appunti Plus esportato.", "success");
      }

      async function importPlusJson(file) {
        if (!file) return;
        let payload;
        try {
          payload = JSON.parse(await file.text());
        } catch (error) {
          return showPlusImportErrors(["Il file non è un JSON valido."]);
        }
        const rawTemplates = Array.isArray(payload) ? payload : payload.templates;
        if (!Array.isArray(rawTemplates)) return showPlusImportErrors(["Il file non contiene modelli Appunti Plus."]);

        const now = new Date().toISOString();
        const existing = new Map((await getAllPlusTemplates()).map(template => [template.id, template]));
        const templates = rawTemplates.map(raw => ({
          id: String(raw.id || uid()),
          title: String(raw.title || "").slice(0, 120),
          template: String(raw.template || ""),
          tags: Array.isArray(raw.tags) ? parseTags(raw.tags.join(",")) : parseTags(raw.tags || ""),
          fields: Array.isArray(raw.fields) ? raw.fields.map(normalizePlusField) : [],
          lastValues: existing.get(String(raw.id))?.lastValues || {},
          favorite: Boolean(raw.favorite ?? existing.get(String(raw.id))?.favorite),
          order: Number.isFinite(raw.order) ? raw.order : (existing.get(String(raw.id))?.order ?? 0),
          createdAt: raw.createdAt || now,
          updatedAt: raw.updatedAt || now
        }));
        const errors = templates.flatMap((template, index) => validatePlusConfig(template.title, template.template, template.fields).map(error => `Modello ${index + 1}: ${error.message}`));
        if (errors.length) return showPlusImportErrors(errors);

        const store = plusTx("readwrite");
        await Promise.all(templates.map(template => requestToPromise(store.put(template))));
        await syncQuickPanelState();
        showPlusImportErrors([]);
        toast(`${templates.length} modelli importati.`, "success");
      }

      function showPlusImportErrors(errors) {
        const summary = $("#plusImportErrors");
        if (!summary) return;
        summary.hidden = !errors.length;
        summary.innerHTML = errors.length ? `<strong>Importazione non riuscita:</strong><ul>${errors.map(error => `<li>${escapeHtml(error)}</li>`).join("")}</ul>` : "";
      }

      function renderPlusBackup() {
        renderShell("plus-backup", `
          <section class="hero">
            <div><h2>Backup Appunti Plus.</h2><p>Salva soltanto modelli, placeholder e operazioni: le compilazioni restano su questo dispositivo.</p></div>
            <a class="btn" href="?view=tool" data-route="tool">Torna ai modelli</a>
          </section>
          <div class="error-summary" id="plusImportErrors" role="alert" hidden></div>
          <section class="backup-grid">
            <article class="panel backup-card"><h3>Esporta</h3><p>Scarica tutti i modelli senza gli ultimi valori compilati.</p><button class="btn primary" id="exportPlusJson" type="button">Scarica JSON</button></article>
            <article class="panel backup-card"><h3>Importa</h3><p>Aggiunge i nuovi modelli e aggiorna quelli con lo stesso ID.</p><input class="field" id="importPlusFile" type="file" accept="application/json,.json" /></article>
          </section>
        `);
      }

      function updateWorkspaceTabs(viewName) {
        const activeWorkspace = viewName === "tool" || viewName.startsWith("plus-") ? "tool" : "notes";
        document.body.classList.toggle("tool-view", activeWorkspace === "tool");
        $$('[data-workspace]').forEach(tab => {
          const active = tab.dataset.workspace === activeWorkspace;
          tab.classList.toggle("active", active);
          if (active) tab.setAttribute("aria-current", "page");
          else tab.removeAttribute("aria-current");
        });
      }

      async function renderRoute(viewName, id) {
        state.currentView = viewName;
        state.editId = id || null;
        updateWorkspaceTabs(viewName);
        if (viewName === "tool") return renderTool();
        if (viewName === "plus-new") return renderPlusForm(null);
        if (viewName === "plus-edit") return renderPlusForm(id);
        if (viewName === "plus-backup") return renderPlusBackup();
        if (viewName === "new" || viewName === "edit") {
          await renderList();
          return openNoteWindow(viewName === "edit" ? id : null);
        }
        if (viewName === "backup") return renderBackup();
        return renderList();
      }

      async function copyText(text) {
        const formats = clipboardFormats(text);
        if (window.ClipboardItem && navigator.clipboard?.write) {
          try {
            await navigator.clipboard.write([new ClipboardItem({
              "text/plain": new Blob([formats.plain], { type: "text/plain" }),
              "text/html": new Blob([formats.html], { type: "text/html" })
            })]);
            return;
          } catch (error) {
            // Il formato ricco non è supportato da tutti i browser.
          }
        }
        try {
          await navigator.clipboard.writeText(formats.plain);
          return;
        } catch (error) {}
        const helper = document.createElement("textarea");
        helper.value = formats.plain;
        helper.setAttribute("readonly", "");
        helper.style.position = "fixed";
        helper.style.opacity = "0";
        document.body.appendChild(helper);
        helper.select();
        document.execCommand("copy");
        helper.remove();
      }

      async function copyNote(id, button, card) {
        const note = await getNote(id);
        if (!note) return toast("Appunto non trovato.", "danger");
        await copyText(note.text);
        if (card) {
          card.classList.remove("copied");
          void card.offsetWidth;
          card.classList.add("copied");
          setTimeout(() => card.classList.remove("copied"), 900);
        }
        if (!button) button = card && card.querySelector('[data-action="copy"]');
        if (!button) return toast("Contenuto copiato negli appunti.", "success");
        button.classList.add("copied");
        button.textContent = "Copiato";
        setTimeout(() => {
          button.classList.remove("copied");
          button.textContent = "Copia veloce";
        }, 1200);
        toast("Contenuto copiato negli appunti.", "success");
      }

      function quickPanelOptions(options = {}) {
        const availableWidth = screen.availWidth || screen.width || QUICK_PANEL_DEFAULTS.width;
        const availableHeight = screen.availHeight || screen.height || QUICK_PANEL_DEFAULTS.height;
        const size = (value, fallback, maximum) => {
          const parsed = Number(value);
          return Math.min(maximum, Math.max(280, Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : fallback));
        };
        const width = size(options.width, QUICK_PANEL_DEFAULTS.width, availableWidth);
        const height = size(options.height, QUICK_PANEL_DEFAULTS.height, availableHeight);
        const defaultLeft = (screen.availLeft || 0) + availableWidth - width - 24;
        const defaultTop = (screen.availTop || 0) + availableHeight - height - 24;
        return {
          width,
          height,
          left: Number.isFinite(Number(options.left)) ? Math.round(Number(options.left)) : defaultLeft,
          top: Number.isFinite(Number(options.top)) ? Math.round(Number(options.top)) : defaultTop,
          forcePopup: Boolean(options.forcePopup)
        };
      }

      function quickPanelErrorMessage(error) {
        if (error?.name === "NotAllowedError") return "Il browser ha negato il Picture-in-Picture. Apro una finestra normale.";
        if (error?.name === "NotSupportedError") return "Picture-in-Picture non supportato. Apro una finestra normale.";
        if (error?.name === "SecurityError") return "Picture-in-Picture bloccato dalle impostazioni di sicurezza. Apro una finestra normale.";
        return "Picture-in-Picture non disponibile. Apro una finestra normale.";
      }

      function cleanupQuickPanel(panelWindow = state.quickPanel.window) {
        if (panelWindow && state.quickPanel.window !== panelWindow) return;
        try { state.quickPanel.port?.close(); } catch (error) {}
        state.quickPanel.window = null;
        state.quickPanel.port = null;
        state.quickPanel.token = "";
        state.quickPanel.mode = "";
      }

      function sendQuickPanelResponse(requestId, ok, data = null, error = "") {
        state.quickPanel.port?.postMessage({ type: "response", requestId, ok, data, error });
      }

      async function quickPanelSnapshot() {
        const remote = storageBridgeRequest("snapshot");
        const notesRequest = DEFAULT_VIEW === "tool"
          ? remote.then(data => data.notes)
          : ensureDb().then(() => getAllNotes());
        const templatesRequest = DEFAULT_VIEW === "tool"
          ? ensurePlusDb().then(() => getAllPlusTemplates())
          : remote.then(data => data.templates);
        const [notesResult, templatesResult] = await Promise.allSettled([
          notesRequest,
          templatesRequest
        ]);
        if (notesResult.status === "rejected" && templatesResult.status === "rejected") {
          throw new Error("Impossibile leggere gli archivi FastAppunti.");
        }
        const notes = notesResult.status === "fulfilled" ? notesResult.value : [];
        const templates = templatesResult.status === "fulfilled" ? templatesResult.value : [];
        return {
          notes: quickNotesPayload(notes),
          templates: quickTemplatesPayload(templates),
          theme: document.documentElement.dataset.theme,
          errors: [
            ...(notesResult.status === "rejected" ? ["Archivio FastAppunti non disponibile."] : []),
            ...(templatesResult.status === "rejected" ? ["Archivio Appunti Plus non disponibile."] : [])
          ]
        };
      }

      async function syncQuickPanelState() {
        const panel = state.quickPanel;
        if (!panel.port || !panel.window || panel.window.closed) return;
        try {
          panel.port.postMessage({ type: "snapshot", data: await quickPanelSnapshot() });
        } catch (error) {
          try {
            panel.port.postMessage({ type: "fatal", error: error?.message || "Impossibile leggere gli archivi." });
          } catch (postError) {
            cleanupQuickPanel(panel.window);
          }
        }
      }

      function quickPanelValues(template, values) {
        return Object.fromEntries(template.fields
          .filter(field => field.kind === "manual")
          .map(field => [field.name, field.inputType === "checkbox" ? values[field.name] === true : String(values[field.name] || "")]));
      }

      async function handleQuickPanelRequest(message) {
        if (!isQuickPanelRequest(message)) return;
        if (message.type === "ready") return syncQuickPanelState();
        if (message.type === "focus-main") {
          window.focus();
          return;
        }

        try {
          if (message.type === "toggle-note-favorite") {
            if (DEFAULT_VIEW === "tool") {
              await storageBridgeRequest(message.type, { id: message.id });
            } else {
              const note = await getNote(message.id);
              if (!note) throw new Error("Appunto non trovato.");
              note.favorite = !note.favorite;
              await saveNote(note);
              if (state.currentView === "list") await renderList();
            }
            sendQuickPanelResponse(message.requestId, true);
            await syncQuickPanelState();
            return;
          }

          if (message.type === "toggle-plus-favorite") {
            if (DEFAULT_VIEW !== "tool") {
              await storageBridgeRequest(message.type, { id: message.id });
            } else {
              const template = await getPlusTemplate(message.id);
              if (!template) throw new Error("Modello non trovato.");
              template.favorite = !template.favorite;
              await savePlusTemplate(template);
              if (state.currentView === "tool") await renderTool();
            }
            sendQuickPanelResponse(message.requestId, true);
            await syncQuickPanelState();
            return;
          }

          if (message.type === "save-note") {
            if (DEFAULT_VIEW === "tool") {
              await storageBridgeRequest("save-note", { note: message.note });
            } else {
              await ensureDb();
              const existing = await getNote(message.note.id);
              if (!existing) throw new Error("Appunto non trovato.");
              const title = message.note.title.trim().slice(0, 120);
              const text = message.note.text.trim();
              if (!title || !text) throw new Error("Titolo e testo sono obbligatori.");
              await saveNote({
                ...existing,
                title,
                text,
                tags: parseTags(message.note.tags),
                updatedAt: new Date().toISOString()
              });
            }
            sendQuickPanelResponse(message.requestId, true);
            if (state.currentView === "list") await renderList();
            await syncQuickPanelState();
            return;
          }

          if (DEFAULT_VIEW !== "tool") {
            const data = await storageBridgeRequest(message.type, { id: message.id, values: message.values });
            sendQuickPanelResponse(message.requestId, true, data);
            if (message.type === "save-plus-values") await syncQuickPanelState();
            return;
          }

          await ensurePlusDb();
          const template = await getPlusTemplate(message.id);
          if (!template) throw new Error("Modello non trovato.");
          const values = quickPanelValues(template, message.values);
          if (message.type === "preview-plus") {
            const result = buildPlusOutput(template.template, template.fields, values);
            sendQuickPanelResponse(message.requestId, true, {
              output: result.output,
              errors: result.errors.map(error => error.message),
              warnings: result.warnings
            });
            return;
          }

          template.lastValues = values;
          await savePlusTemplate(template);
          sendQuickPanelResponse(message.requestId, true);
          if (state.currentView === "tool") await renderTool();
          await syncQuickPanelState();
        } catch (error) {
          sendQuickPanelResponse(message.requestId, false, null, error?.message || "Operazione non riuscita.");
        }
      }

      function prepareQuickPanel(panelWindow, mode) {
        const token = uid();
        const channel = new MessageChannel();
        const doc = panelWindow.document;

        state.quickPanel.window = panelWindow;
        state.quickPanel.port = channel.port1;
        state.quickPanel.token = token;
        state.quickPanel.mode = mode;
        channel.port1.onmessage = event => handleQuickPanelRequest(event.data);
        channel.port1.start();

        doc.documentElement.lang = "it";
        doc.documentElement.dataset.theme = document.documentElement.dataset.theme;
        doc.documentElement.dataset.panelToken = token;
        doc.documentElement.dataset.panelMode = mode;
        doc.documentElement.dataset.openerOrigin = location.origin;
        doc.documentElement.dataset.defaultTab = document.body.classList.contains("tool-view") ? "plus" : "notes";
        doc.head.replaceChildren();
        doc.body.replaceChildren();
        doc.title = "Pannello rapido FastAppunti";
        doc.body.className = "quick-panel-body";

        const viewport = doc.createElement("meta");
        viewport.name = "viewport";
        viewport.content = "width=device-width, initial-scale=1";
        const icon = doc.createElement("link");
        icon.rel = "icon";
        icon.href = new URL("fastappunti-icon.png", location.href).href;
        const stylesheet = doc.createElement("link");
        stylesheet.rel = "stylesheet";
        stylesheet.href = new URL("styles.css?v=2.6", location.href).href;
        doc.head.append(viewport, icon, stylesheet);

        const root = doc.createElement("main");
        root.id = "quickPanelApp";
        doc.body.appendChild(root);

        const script = doc.createElement("script");
        script.src = new URL("quick-panel.js?v=2.6", location.href).href;
        script.onload = () => {
          try {
            if (panelWindow.connectFastAppuntiPanel?.(channel.port2, token)) return;
          } catch (error) {}
          const targetOrigin = location.origin === "null" ? "*" : location.origin;
          panelWindow.postMessage({ type: "fastappunti:init", token }, targetOrigin, [channel.port2]);
        };
        script.onerror = () => {
          toast("Impossibile caricare il pannello rapido.", "danger");
          try { panelWindow.close(); } catch (error) {}
          cleanupQuickPanel(panelWindow);
        };
        doc.body.appendChild(script);
        panelWindow.addEventListener("pagehide", () => cleanupQuickPanel(panelWindow), { once: true });
      }

      /**
       * Apre il pannello rapido. Document PiP richiede un gesto utente e un contesto sicuro.
       * Il browser gestisce la posizione del PiP; left/top valgono soltanto per il pop-up.
       * Supporto desktop al giugno 2026: Chrome/Edge 116+, Firefox 151+; Waterfox ESR 140 e Safari usano il fallback.
       */
      async function openFastAppuntiPanel(options = {}) {
        const existing = state.quickPanel.window;
        if (existing && !existing.closed) {
          try { existing.focus(); } catch (error) {}
          return existing;
        }
        cleanupQuickPanel();

        const config = quickPanelOptions(options);
        let panelWindow = null;
        let mode = "popup";
        let fallbackMessage = "";
        const hasDocumentPip = typeof window.documentPictureInPicture?.requestWindow === "function";
        const canUsePip = !config.forcePopup && !state.quickPanel.preferPopup
          && window.isSecureContext
          && hasDocumentPip;

        if (!config.forcePopup && !canUsePip) {
          if (!hasDocumentPip && document.pictureInPictureEnabled) {
            fallbackMessage = "Questo browser supporta soltanto il PiP video, non i pannelli HTML. Apro una finestra normale.";
          } else if (!hasDocumentPip) {
            fallbackMessage = "Document Picture-in-Picture non supportato. Apro una finestra normale.";
          } else if (!window.isSecureContext) {
            fallbackMessage = "Picture-in-Picture richiede un contesto sicuro. Apro una finestra normale.";
          }
        }

        if (canUsePip) {
          try {
            panelWindow = await window.documentPictureInPicture.requestWindow({ width: config.width, height: config.height });
            mode = "pip";
          } catch (error) {
            state.quickPanel.preferPopup = true;
            fallbackMessage = quickPanelErrorMessage(error);
          }
        }

        if (!panelWindow) {
          const features = [
            "popup=yes",
            "resizable=yes",
            "scrollbars=yes",
            `width=${config.width}`,
            `height=${config.height}`,
            `left=${config.left}`,
            `top=${config.top}`
          ].join(",");
          panelWindow = window.open("", "FastAppuntiQuickPanel", features);
          if (!panelWindow) {
            state.quickPanel.preferPopup = true;
            toast("Il browser ha bloccato la finestra. Consenti i pop-up e premi di nuovo Pannello rapido.", "danger");
            return null;
          }
        }

        try {
          prepareQuickPanel(panelWindow, mode);
          panelWindow.focus();
          if (fallbackMessage) toast(fallbackMessage);
          return panelWindow;
        } catch (error) {
          try { panelWindow.close(); } catch (closeError) {}
          cleanupQuickPanel(panelWindow);
          toast("Impossibile aprire il pannello rapido.", "danger");
          return null;
        }
      }

      window.openFastAppuntiPanel = openFastAppuntiPanel;

      async function confirmDelete(id) {
        const note = await getNote(id);
        if (!note) return toast("Appunto non trovato.", "danger");
        const ok = window.confirm(`Eliminare "${note.title || "Senza titolo"}"?`);
        if (!ok) return;
        await deleteNote(id);
        await syncQuickPanelState();
        closeAppWindow(findAppWindow(`note:${id}`));
        toast("Appunto eliminato.", "danger");
        await transitionTo("list", null, state.currentView !== "list");
      }

      async function handleSubmit(form) {
        const now = new Date().toISOString();
        const dialog = form.closest(".app-window");
        const existing = dialog.dataset.noteId ? await getNote(dialog.dataset.noteId) : null;
        const note = {
          id: existing ? existing.id : uid(),
          title: form.title.value.trim(),
          text: form.text.value.trim(),
          tags: parseTags(form.tags.value),
          favorite: Boolean(existing?.favorite),
          createdAt: existing ? existing.createdAt : now,
          updatedAt: now,
          order: existing
            ? (existing.order ?? state.notes.find(item => item.id === existing.id)?.order ?? 0)
            : state.notes.reduce((min, item) => Math.min(min, item.order), 0) - 1
        };
        if (!note.title || !note.text) {
          toast("Titolo e testo sono obbligatori.", "danger");
          return;
        }
        await saveNote(note);
        await syncQuickPanelState();
        toast(existing ? "Modifiche salvate." : "Appunto salvato.", "success");
        closeAppWindow(dialog);
        state.query = "";
        state.activeTag = "";
        await transitionTo("list", null, state.currentView !== "list");
      }

      async function exportJson() {
        const notes = await getAllNotes();
        const payload = {
          app: "Appunti Rapidi",
          appVersion: "release v2.6",
          exportedAt: new Date().toISOString(),
          version: 1,
          notes
        };
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = "appunti-rapidi-backup.json";
        link.click();
        URL.revokeObjectURL(url);
        toast("Backup JSON esportato.", "success");
      }

      async function importJson(file) {
        if (!file) return;
        const text = await file.text();
        let payload;
        try {
          payload = JSON.parse(text);
        } catch (error) {
          toast("File JSON non valido.", "danger");
          return;
        }

        const notes = Array.isArray(payload) ? payload : payload.notes;
        if (!Array.isArray(notes)) {
          toast("Il file non contiene appunti importabili.", "danger");
          return;
        }

        const now = new Date().toISOString();
        const store = tx("readwrite");
        await Promise.all(notes.map(raw => {
          const note = {
            id: String(raw.id || uid()),
            title: String(raw.title || "Senza titolo").slice(0, 120),
            text: String(raw.text || ""),
            tags: Array.isArray(raw.tags) ? parseTags(raw.tags.join(",")) : parseTags(raw.tags || ""),
            favorite: Boolean(raw.favorite),
            order: Number.isFinite(raw.order) ? raw.order : 0,
            createdAt: raw.createdAt || now,
            updatedAt: raw.updatedAt || now
          };
          return requestToPromise(store.put(note));
        }));
        await syncQuickPanelState();
        toast(`${notes.length} appunti importati.`, "success");
      }

      function bindEvents() {
        let draggedCard = null;
        let ignoreCardClick = false;

        document.addEventListener("pointerdown", event => {
          if (event.target.closest("#taskbar")) return;
          const dialog = event.target.closest(".app-window");
          if (dialog) {
            if (!dialog.classList.contains("is-active")) focusAppWindow(dialog);
            return;
          }
          if (appWindows().some(item => item.classList.contains("is-active"))) {
            appWindows().forEach(item => item.classList.remove("is-active"));
            renderTaskbar();
          }
        });
        document.addEventListener("focusin", event => {
          const dialog = event.target.closest(".app-window");
          if (dialog && !dialog.classList.contains("is-active")) focusAppWindow(dialog);
        });
        document.addEventListener("click", event => {
          const dialog = event.target.closest(".app-window");
          if (event.target.closest("[data-window-minimize]")) minimizeAppWindow(dialog);
          if (event.target.closest("[data-window-close]")) closeAppWindow(dialog);
          const item = event.target.closest("[data-window-target]");
          if (!item) return;
          const target = appWindows().find(win => win.dataset.windowId === item.dataset.windowTarget);
          if (!target) return;
          if (target.classList.contains("is-active") && !target.hidden) minimizeAppWindow(target);
          else focusAppWindow(target);
        });

        document.addEventListener("keydown", event => {
          if (event.key !== "Enter" || event.isComposing || event.shiftKey || event.ctrlKey || event.metaKey || event.altKey) return;
          if (event.target.matches("#placeholderName")) {
            event.preventDefault();
            insertPlusPlaceholder();
            return;
          }
          if (!event.target.matches("[data-note-form] input, #plusTemplateForm input")) return;
          event.preventDefault();
          event.target.form.requestSubmit();
        });

        window.addEventListener("beforeunload", event => {
          if (!hasUnsavedChanges()) return;
          event.preventDefault();
          event.returnValue = "";
        });
        document.addEventListener("themechange", event => {
          state.quickPanel.port?.postMessage({ type: "theme", theme: event.detail });
        });

        document.addEventListener("dragstart", event => {
          const card = event.target.closest(".note-card[data-note-id], .plus-card[data-plus-id]");
          if (!card) return;
          draggedCard = card;
          ignoreCardClick = true;
          event.dataTransfer.effectAllowed = "move";
          event.dataTransfer.setData("text/plain", card.dataset.noteId || card.dataset.plusId);
          requestAnimationFrame(() => card.classList.add("dragging"));
        });

        document.addEventListener("dragover", event => {
          const region = event.target.closest("#notesRegion, #plusRegion");
          const target = event.target.closest(draggedCard?.dataset.plusId ? ".plus-card[data-plus-id]" : ".note-card[data-note-id]");
          if (!region || !draggedCard) return;
          event.preventDefault();
          if (!target || target === draggedCard || target.dataset.favorite !== draggedCard.dataset.favorite) return;
          const after = event.clientY > target.getBoundingClientRect().top + target.offsetHeight / 2;
          region.insertBefore(draggedCard, after ? target.nextSibling : target);
        });

        document.addEventListener("drop", async event => {
          const region = event.target.closest("#notesRegion, #plusRegion");
          if (!region || !draggedCard) return;
          event.preventDefault();
          if (region.id === "plusRegion") {
            await saveDisplayedPlusOrder($$(".plus-card[data-plus-id]", region).map(card => card.dataset.plusId));
          } else {
            await saveDisplayedOrder($$(".note-card[data-note-id]", region).map(card => card.dataset.noteId));
          }
          toast("Ordine delle schede salvato.", "success");
        });

        document.addEventListener("dragend", () => {
          if (draggedCard) draggedCard.classList.remove("dragging");
          draggedCard = null;
          setTimeout(() => { ignoreCardClick = false; }, 0);
        });

        document.addEventListener("click", async event => {
          if (event.target.closest("[data-open-quick-panel]")) {
            await openFastAppuntiPanel();
            return;
          }
          const routeLink = event.target.closest("[data-route]");
          if (routeLink) {
            event.preventDefault();
            if (routeLink.dataset.route === "new") await openNoteWindow(null);
            else await transitionTo(routeLink.dataset.route, routeLink.dataset.id || null, true);
            return;
          }

          const plusAction = event.target.closest("[data-plus-action]");
          if (plusAction) {
            const card = plusAction.closest("[data-plus-id]");
            const id = card && card.dataset.plusId;
            if (!id) return;
            if (plusAction.dataset.plusAction === "favorite") await togglePlusFavorite(id);
            if (plusAction.dataset.plusAction === "run") await runPlusTemplate(id);
            if (plusAction.dataset.plusAction === "edit") await transitionTo("plus-edit", id, true);
            if (plusAction.dataset.plusAction === "delete") await confirmDeletePlus(id);
            return;
          }

          const actionButton = event.target.closest("[data-action]");
          if (!actionButton) return;
          const card = actionButton.closest("[data-note-id]");
          const id = card && card.dataset.noteId;
          if (!id) return;

          if (actionButton.dataset.action === "favorite") await toggleNoteFavorite(id);
          if (actionButton.dataset.action === "copy") await copyNote(id, actionButton, card);
          if (actionButton.dataset.action === "edit") await openNoteWindow(id);
          if (actionButton.dataset.action === "delete") await confirmDelete(id);
        });

        document.addEventListener("click", async event => {
          const card = event.target.closest(".note-card[data-note-id]");
          if (!card || ignoreCardClick || event.target.closest("[data-action]")) return;
          await copyNote(card.dataset.noteId, null, card);
        });

        document.addEventListener("click", async event => {
          const card = event.target.closest(".plus-card[data-plus-id]");
          if (!card || ignoreCardClick || event.target.closest("[data-plus-action]")) return;
          await runPlusTemplate(card.dataset.plusId);
        });

        document.addEventListener("keydown", async event => {
          if (event.key !== "Enter" && event.key !== " ") return;
          const card = event.target.closest(".note-card[data-note-id]");
          if (!card || event.target.closest("[data-action]")) return;
          event.preventDefault();
          await copyNote(card.dataset.noteId, null, card);
        });

        document.addEventListener("keydown", async event => {
          if (event.key !== "Enter" && event.key !== " ") return;
          const card = event.target.closest(".plus-card[data-plus-id]");
          if (!card || event.target.closest("[data-plus-action]")) return;
          event.preventDefault();
          await runPlusTemplate(card.dataset.plusId);
        });

        document.addEventListener("submit", async event => {
          if (event.target.matches("[data-note-form]")) {
            event.preventDefault();
            await handleSubmit(event.target);
          }
          if (event.target.id === "plusTemplateForm") {
            event.preventDefault();
            const submit = event.submitter;
            if (submit) submit.disabled = true;
            try { await handlePlusSubmit(event.target); }
            catch (error) { toast(`Salvataggio non riuscito: ${error.message}`, "danger"); }
            finally { if (submit) submit.disabled = false; }
          }
          if (event.target.matches("[data-plus-run-form]")) {
            event.preventDefault();
            const dialog = event.target.closest(".app-window");
            const submit = $("[data-plus-submit]", dialog);
            submit.disabled = true;
            try { await submitPlusDialog(dialog); }
            finally { submit.disabled = false; }
          }
        });

        document.addEventListener("input", event => {
          if (event.target.matches("[data-plus-value]")) {
            const dialog = event.target.closest(".app-window");
            $("[data-plus-copy]", dialog).disabled = true;
            $("[data-plus-preview]", dialog).value = "";
            $("[data-plus-preview]", dialog).placeholder = "Campi modificati. Premi Genera per aggiornare il risultato.";
          }
          if (event.target.matches("[data-field-label], [data-field-checked-text]")) {
            const name = event.target.dataset.fieldLabel ?? event.target.dataset.fieldCheckedText;
            const field = state.plusDraft.fields.find(item => item.name === name);
            if (field) field[event.target.hasAttribute("data-field-label") ? "label" : "checkedText"] = event.target.value;
            validatePlusEditor();
          }
          if (event.target.id === "searchNotes") {
            state.query = event.target.value;
            applyFilters();
            renderNextNotes(true);
          }
          if (event.target.id === "searchPlus") {
            state.plusQuery = event.target.value;
            renderPlusCards();
          }
          if (event.target.matches("#plusTitle, #plusTemplate")) validatePlusEditor();
          if (event.target.matches("[data-field-line-prefix]")) {
            const field = state.plusDraft.fields.find(item => item.name === event.target.dataset.fieldLinePrefix);
            if (field) field.linePrefix = event.target.value;
          }
          if (event.target.matches("[data-field-list-instructions]")) {
            const field = state.plusDraft.fields.find(item => item.name === event.target.dataset.fieldListInstructions);
            if (field) field.listInstructions = event.target.value;
          }
          if (event.target.matches("[data-field-line-input-pattern]")) {
            const field = state.plusDraft.fields.find(item => item.name === event.target.dataset.fieldLineInputPattern);
            if (field) field.lineInputPattern = event.target.value;
            validatePlusEditor();
          }
          if (event.target.matches("[data-field-line-output-pattern]")) {
            const field = state.plusDraft.fields.find(item => item.name === event.target.dataset.fieldLineOutputPattern);
            if (field) field.lineOutputPattern = event.target.value;
            validatePlusEditor();
          }
          if (event.target.matches("[data-field-extract-prefix]")) {
            const field = state.plusDraft.fields.find(item => item.name === event.target.dataset.fieldExtractPrefix);
            if (field?.extraction) field.extraction.prefix = event.target.value;
            validatePlusEditor();
          }
          if (event.target.matches("[data-field-extract-name]")) {
            const field = state.plusDraft.fields.find(item => item.name === event.target.dataset.fieldExtractName);
            if (field?.extraction) field.extraction.name = event.target.value.trim();
            validatePlusEditor();
          }
        });

        document.addEventListener("change", async event => {
          if (event.target.id === "tagFilter") {
            state.activeTag = event.target.value;
            applyFilters();
            renderNextNotes(true);
          }
          if (event.target.id === "plusTagFilter") {
            state.plusActiveTag = event.target.value;
            renderPlusCards();
          }
          if (event.target.id === "importFile") {
            await importJson(event.target.files[0]);
            event.target.value = "";
          }
          if (event.target.id === "placeholderKind") {
            const computed = event.target.value === "computed";
            $("#builderInputTypeRow").hidden = computed;
            $("#builderCalculationRow").hidden = !computed;
          }
          if (event.target.matches("[data-field-type]")) {
            const field = state.plusDraft.fields.find(item => item.name === event.target.dataset.fieldType);
            if (event.target.value === "checkbox" && (field.extraction || field.lineInputPattern || field.lineOutputPattern)) {
              event.target.value = field.inputType;
              toast("Disattiva prima estrazioni e trasformazioni nelle opzioni avanzate.", "danger");
              return;
            }
            if (field) field.inputType = event.target.value;
            renderPlusFieldConfigs();
            document.getElementById(`plusType-${field.name}`)?.focus();
            validatePlusEditor();
          }
          if (event.target.matches("[data-field-required]")) {
            const field = state.plusDraft.fields.find(item => item.name === event.target.dataset.fieldRequired);
            if (field) field.required = event.target.checked;
            event.target.closest(".placeholder-config").querySelector("summary span").textContent = event.target.checked ? "Obbligatorio" : "Facoltativo";
            validatePlusEditor();
          }
          if (event.target.matches("[data-field-operation]")) {
            const field = state.plusDraft.fields.find(item => item.name === event.target.dataset.fieldOperation);
            if (field) {
              field.operation = event.target.value;
              delete field.formula;
            }
            validatePlusEditor();
          }
          if (event.target.matches("[data-field-source]")) {
            const field = state.plusDraft.fields.find(item => item.name === event.target.dataset.fieldSource);
            if (field) field.source = event.target.value;
            validatePlusEditor();
          }
          if (event.target.matches("[data-field-extraction]")) {
            const field = state.plusDraft.fields.find(item => item.name === event.target.dataset.fieldExtraction);
            if (field) {
              if (event.target.checked) {
                field.extraction = { name: `${field.name}_riferimento`, prefix: "" };
              } else {
                const token = `%${field.extraction?.name}%`;
                $("#plusTemplate").value = $("#plusTemplate").value.split(token).join("");
                delete field.extraction;
              }
              renderPlusFieldConfigs();
              const toggle = document.getElementById(`plusExtraction-${field.name}`);
              if (toggle) {
                toggle.closest(".advanced-options").open = true;
                toggle.focus();
              }
              validatePlusEditor();
            }
          }
          if (event.target.id === "importPlusFile") {
            await importPlusJson(event.target.files[0]);
            event.target.value = "";
          }
        });

        document.addEventListener("click", async event => {
          if (event.target.id === "loadMore") renderNextNotes(false);
          if (event.target.id === "togglePlusUltra") {
            state.plusUltra = !state.plusUltra;
            event.target.classList.toggle("primary", state.plusUltra);
            event.target.setAttribute("aria-pressed", String(state.plusUltra));
            event.target.textContent = `Ultra rapida: ${state.plusUltra ? "ON" : "OFF"}`;
            setPlusUltraStatus(state.plusUltra ? "Modalità ultra rapida attiva: scegli una scheda per elaborare il contenuto degli appunti." : "");
          }
          if (event.target.matches("[data-note-delete]")) await confirmDelete(event.target.closest(".app-window").dataset.noteId);
          if (event.target.id === "deleteExamples") await deleteExamples();
          if (event.target.id === "exportJson") await exportJson();
          if (event.target.id === "showPlaceholderBuilder") {
            const textarea = $("#plusTemplate");
            state.plusCursor = { start: textarea.selectionStart, end: textarea.selectionEnd };
            $("#placeholderSource").innerHTML = sourceOptions($("#placeholderSource").value);
            $("#placeholderBuilder").hidden = false;
            $("#placeholderName").focus();
          }
          if (event.target.id === "cancelPlaceholder") {
            $("#placeholderBuilder").hidden = true;
            $("#placeholderBuilderError").textContent = "";
          }
          if (event.target.id === "insertPlaceholder") insertPlusPlaceholder();
          if (event.target.matches("[data-insert-extraction]")) insertExtractionPlaceholder(event.target.dataset.insertExtraction);
          if (event.target.matches("[data-remove-placeholder]")) removePlusPlaceholder(event.target.dataset.removePlaceholder);
          if (event.target.matches("[data-error-target]")) {
            const target = event.target.dataset.errorTarget;
            const field = $$('[data-validation-target]').find(item => item.dataset.validationTarget === target);
            if (field) {
              let ancestor = field.parentElement;
              while (ancestor) {
                if (ancestor.tagName === "DETAILS") ancestor.open = true;
                ancestor = ancestor.parentElement;
              }
              field.focus();
            }
          }
          if (event.target.matches("[data-plus-copy]") && !event.target.disabled) {
            await copyText($("[data-plus-preview]", event.target.closest(".app-window")).value);
            toast("Testo copiato negli appunti.", "success");
          }
          if (event.target.id === "exportPlusJson") await exportPlusJson();
        });

        window.addEventListener("popstate", async () => {
          const route = routeFromUrl();
          await transitionTo(route.view, route.id, false);
        });

        window.addEventListener("pagehide", () => {
          try { state.quickPanel.window?.close(); } catch (error) {}
          cleanupQuickPanel();
          state.storageBridge.pending.forEach(request => {
            clearTimeout(request.timer);
            request.reject(new Error("Pagina chiusa."));
          });
          state.storageBridge.pending.clear();
          state.storageBridge.port?.close();
          state.storageBridge.iframe?.remove();
        });
      }

      async function deleteExamples() {
        const plus = DEFAULT_VIEW === "tool";
        const items = (plus ? state.plusTemplates : state.notes).filter(isPreset);
        if (!items.length || !window.confirm(`Eliminare ${items.length} esempi? I tuoi ${plus ? "modelli" : "appunti"} non vengono toccati (se hai modificato un esempio, verrà eliminato anche lui).`)) return;
        await Promise.all(items.map(item => plus ? deletePlusTemplate(item.id) : deleteNote(item.id)));
        await syncQuickPanelState();
        toast("Esempi eliminati.", "danger");
        await transitionTo(plus ? "tool" : "list", null, true);
      }

      async function init() {
        if (!("indexedDB" in window)) {
          renderShell("error", `
            <section class="panel empty-state">
              <h3>IndexedDB non disponibile</h3>
              <p>Apri l'app in un browser moderno per salvare gli appunti in modo persistente.</p>
            </section>
          `);
          return;
        }
        if (STORAGE_BRIDGE_TOKEN) return initStorageBridge();
        bindEvents();
        if (DEFAULT_VIEW === "tool") {
          await ensurePlusDb();
        } else {
          state.db = await openDb();
        }
        const route = routeFromUrl();
        await renderRoute(route.view, route.id);
      }

      init().catch(error => {
        console.error(error);
        renderShell("error", `
          <section class="panel empty-state">
            <h3>Impossibile aprire l'archivio</h3>
            <p>${escapeHtml(error && error.message || "Errore imprevisto durante l'avvio.")}</p>
            <a class="btn primary" href="?view=${DEFAULT_VIEW}">Riprova</a>
          </section>
        `);
      });
    })();
