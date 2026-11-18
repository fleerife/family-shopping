// Firebase コンソールで発行されたブラウザ用設定です。
const firebaseConfig = {
  apiKey: "AIzaSyBJ_y-CfIOTJkBdpUlfT7HG5e8WfuJLXqk",
  authDomain: "family-shopping-a21a9.firebaseapp.com",
  projectId: "family-shopping-a21a9",
  appId: "1:328559928583:web:c00e715fdd61756e2651a2"
};

const ui = Object.fromEntries(
  ["status", "login", "logout", "shopping", "add-form", "item-name", "add",
    "refresh", "empty", "pending", "purchased", "completed"]
    .map((id) => [id, document.getElementById(id)])
);

let store;
let activeSession = 0;
let busy = false;

function showStatus(message, error = false) {
  ui.status.textContent = message;
  ui.status.classList.toggle("error", error);
}

function clearList() {
  ui.pending.replaceChildren();
  ui.completed.replaceChildren();
  ui.purchased.hidden = true;
  ui.empty.hidden = true;
}

function render(items) {
  clearList();
  for (const item of items) {
    const row = document.createElement("li");
    const label = document.createElement("span");
    label.textContent = item.name;
    row.append(label);
    if (!item.purchased) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "secondary";
      button.textContent = "買った";
      button.setAttribute("aria-label", item.name + "を購入済みにする");
      button.disabled = busy;
      button.addEventListener("click", () => {
        run(item.name + "を購入済みにしました。", () => store.purchase(item.id));
      });
      row.append(button);
    }
    (item.purchased ? ui.completed : ui.pending).append(row);
  }
  ui.empty.hidden = ui.pending.childElementCount > 0;
  ui.purchased.hidden = ui.completed.childElementCount === 0;
}

function setBusy(value) {
  busy = value;
  ui.add.disabled = value;
  ui.refresh.disabled = value;
  for (const button of ui.pending.querySelectorAll("button")) button.disabled = value;
}

async function run(message, change) {
  if (busy) return;
  const session = activeSession;
  let saved = false;
  setBusy(true);
  try {
    if (change) {
      await change(session);
      saved = true;
    }
    if (session !== activeSession) return;
    const list = await store.list();
    if (session !== activeSession) return;
    render(list);
    showStatus(message);
  } catch (error) {
    if (session !== activeSession) return;
    const denied = error.code === "permission-denied";
    if (denied) {
      clearList();
      ui.shopping.hidden = true;
    }
    showStatus(denied
      ? "このアカウントは買い物リストを使えません。"
      : saved
        ? "変更は保存されました。リストを読み込めなかったので、更新してください。"
        : "操作できませんでした。接続を確認して、もう一度お試しください。", true);
  } finally {
    if (session === activeSession) setBusy(false);
  }
}

ui["add-form"].addEventListener("submit", (event) => {
  event.preventDefault();
  const input = ui["item-name"];
  const name = input.value.trim();
  if (!name) {
    showStatus("買うものの名前を入力してください。", true);
    input.focus();
    return;
  }
  run(name + "を追加しました。", async (session) => {
    await store.add(name);
    if (session === activeSession && input.value.trim() === name) input.value = "";
  });
});
ui.refresh.addEventListener("click", () => run("リストを更新しました。"));

function openDemo() {
  let items = [];
  const key = "family-shopping-demo-v1";
  try {
    items = JSON.parse(localStorage.getItem(key) ?? "[]");
  } catch {
    // 保存を使えないブラウザでも、このタブでは試せます。
  }
  function save() {
    try {
      localStorage.setItem(key, JSON.stringify(items));
    } catch {
      // このタブの表示はメモリーに保存されたデータで続けます。
    }
  }
  store = {
    async list() { return items; },
    async add(name) {
      items.unshift({ id: Date.now() + Math.random(), name, purchased: false });
      save();
    },
    async purchase(id) {
      const item = items.find((entry) => entry.id === id);
      if (item) item.purchased = true;
      save();
    }
  };
  render(items);
  ui.shopping.hidden = false;
  showStatus("お試しモード。この端末のブラウザで試せます。");
}

async function openSharedList() {
  const [core, authSdk, dbSdk] = await Promise.all([
    import("https://www.gstatic.com/firebasejs/13.3.0/firebase-app.js"),
    import("https://www.gstatic.com/firebasejs/13.3.0/firebase-auth.js"),
    import("https://www.gstatic.com/firebasejs/13.3.0/firebase-firestore.js")
  ]);
  const app = core.initializeApp(firebaseConfig);
  const auth = authSdk.getAuth(app);
  const db = dbSdk.getFirestore(app);
  const items = dbSdk.collection(db, "items");
  const byNewest = dbSdk.query(items, dbSdk.orderBy("createdAt", "desc"));
  store = {
    async list() {
      const snapshot = await dbSdk.getDocsFromServer(byNewest);
      return snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
    },
    add(name) {
      return dbSdk.addDoc(items, { name, purchased: false, createdAt: dbSdk.serverTimestamp() });
    },
    purchase(id) {
      return dbSdk.updateDoc(dbSdk.doc(items, id), { purchased: true });
    }
  };

  ui.login.addEventListener("click", async () => {
    ui.login.disabled = true;
    try {
      await authSdk.signInWithPopup(auth, new authSdk.GoogleAuthProvider());
    } catch (error) {
      const messages = {
        "auth/popup-blocked": "ログイン画面がブロックされました。ブラウザでポップアップを許可してください。",
        "auth/popup-closed-by-user": "ログイン画面を閉じました。もう一度ログインできます。",
        "auth/unauthorized-domain": "この URL はログインに使えません。Firebase の承認済みドメインを確認してください。"
      };
      showStatus(messages[error.code] ?? "ログインできませんでした。ブラウザで開き直して、もう一度お試しください。", true);
    } finally {
      ui.login.disabled = false;
    }
  });

  ui.logout.addEventListener("click", async () => {
    try {
      await authSdk.signOut(auth);
    } catch {
      showStatus("ログアウトできませんでした。もう一度お試しください。", true);
    }
  });

  authSdk.onAuthStateChanged(auth, async (user) => {
    const session = ++activeSession;
    clearList();
    setBusy(false);
    ui["item-name"].value = "";
    ui.shopping.hidden = true;
    ui.login.hidden = Boolean(user);
    ui.logout.hidden = !user;
    if (!user) {
      showStatus("家族の買い物リストを見るにはログインしてください。");
      return;
    }
    showStatus("リストを読み込み中…");
    try {
      const member = await dbSdk.getDocFromServer(dbSdk.doc(db, "members", user.uid));
      if (session !== activeSession) return;
      if (member.data()?.enabled !== true) {
        showStatus("このアカウントはまだ家族として登録されていません。", true);
        return;
      }
      const list = await store.list();
      if (session !== activeSession) return;
      render(list);
      ui.refresh.hidden = false;
      ui.shopping.hidden = false;
      showStatus("家族のリストを表示しています。");
    } catch (error) {
      if (session !== activeSession) return;
      showStatus(error.code === "permission-denied"
        ? "このアカウントは買い物リストを使えません。"
        : "リストを読み込めませんでした。接続を確認してページを開き直してください。", true);
    }
  });
}

if (firebaseConfig) {
  openSharedList().catch(() => showStatus("共有リストを開けません。Firebase の設定と接続を確認してください。", true));
} else {
  openDemo();
}
