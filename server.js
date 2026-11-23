const express = require("express");
const session = require("express-session");
const SQLiteStore = require("connect-sqlite3")(session);
const { createClient } = require("@libsql/client");
const bcrypt = require("bcryptjs");
const multer = require("multer");
const fs = require("fs");
const path = require("path");

const app = express();
app.set("trust proxy", 1);
const PORT = process.env.PORT || 3000;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "data");
fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(path.join(DATA_DIR, "uploads"), { recursive: true });

if (!process.env.TURSO_DATABASE_URL || !process.env.TURSO_AUTH_TOKEN) {
  console.error("Missing TURSO_DATABASE_URL or TURSO_AUTH_TOKEN.");
  process.exit(1);
}
const client = createClient({ url: process.env.TURSO_DATABASE_URL, authToken: process.env.TURSO_AUTH_TOKEN });
function plainRows(result) {
  return result.rows.map(row => Object.fromEntries(result.columns.map((name, i) => [name, row[i]])));
}
const db = {
  exec: sql => client.executeMultiple(sql),
  prepare(sql) {
    return {
      async get(...args) {
        const r = await client.execute({ sql, args });
        return plainRows(r)[0];
      },
      async all(...args) {
        const r = await client.execute({ sql, args });
        return plainRows(r);
      },
      async run(...args) {
        const r = await client.execute({ sql, args });
        return { changes: Number(r.rowsAffected || 0), lastInsertRowid: r.lastInsertRowid };
      }
    };
  }
};
const route = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const insertAudit = db.prepare("INSERT INTO audit(user_id,action,details) VALUES(?,?,?)");
async function audit(req, action, details) {
  await insertAudit.run(req.session.user.id, action, details || "");
}
app.use(express.json({ limit: "1mb" }));
app.use(session({
  store: new SQLiteStore({ db: "sessions.sqlite", dir: DATA_DIR }),
  secret: process.env.SESSION_SECRET || "local-development-secret-change-this",
  resave: false, saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 8 * 60 * 60 * 1000 }
}));
app.use(express.static(path.join(__dirname, "public")));
app.use("/uploads", express.static(path.join(DATA_DIR, "uploads")));

const modules = ["sales","debtor_payment","dispatch","return","purchase","supplier_payment","expense","production","stock_in","stock_out","staff"];
const roles = {
  admin: modules,
  manager: modules.filter(x => x !== "staff"),
  accountant: ["sales","debtor_payment","purchase","supplier_payment","expense","staff"],
  sales: ["sales","debtor_payment","dispatch","return"],
  production: ["production","stock_out"],
  storekeeper: ["stock_in","stock_out","purchase"]
};
function auth(req,res,next) {
  if (!req.session.user) return res.status(401).json({error:"Please sign in"});
  next();
}

app.get("/api/me", route(async (req,res) => {
  const setting = await db.prepare("SELECT value FROM settings WHERE key='logo'").get();
  res.set("Cache-Control","no-store");
  res.json({user:req.session.user||null,logo:setting?.value||null});
}));
app.post("/api/login", route(async (req,res) => {
  const {username,password} = req.body || {};
  const user = await db.prepare("SELECT * FROM users WHERE username=? AND active=1").get(String(username||""));
  if (!user || !bcrypt.compareSync(String(password||""),user.password_hash))
    return res.status(401).json({error:"Incorrect username or password"});
  req.session.regenerate(err => {
    if (err) return res.status(500).json({error:"Could not start session"});
    req.session.user={id:user.id,username:user.username,name:user.full_name,role:user.role};
    audit(req,"login",user.username).then(() => req.session.save(saveErr => {
      if (saveErr) return res.status(500).json({error:"Could not save login session"});
      res.json({user:req.session.user});
    })).catch(() => res.status(500).json({error:"Could not record login"}));
  });
}));
app.post("/api/logout",auth,route(async (req,res) => {
  await audit(req,"logout","");
  req.session.destroy(() => res.json({ok:true}));
}));
app.get("/api/records",auth,route(async (req,res) => {
  const rows = req.query.module
    ? await db.prepare("SELECT * FROM records WHERE module=? ORDER BY id DESC LIMIT 500").all(req.query.module)
    : await db.prepare("SELECT * FROM records ORDER BY id DESC LIMIT 500").all();
  res.json(rows.map(r=>({...r,data:JSON.parse(r.data)})));
}));
app.post("/api/records/:module",auth,route(async (req,res) => {
  const module=req.params.module;
  if (!modules.includes(module)) return res.status(400).json({error:"Unknown record type"});
  if (!(roles[req.session.user.role]||[]).includes(module)) return res.status(403).json({error:"Not permitted"});
  const data=req.body||{};
  if (!data.date) data.date=new Date().toISOString().slice(0,10);
  const result=await db.prepare("INSERT INTO records(module,data,created_by) VALUES(?,?,?)").run(module,JSON.stringify(data),req.session.user.id);
  await audit(req,"create",`${module} #${result.lastInsertRowid}`);
  res.json({id:Number(result.lastInsertRowid),module,data});
}));
app.delete("/api/records/:id",auth,route(async (req,res) => {
  if (req.session.user.role!=="admin") return res.status(403).json({error:"Only administrators can delete records"});
  const row=await db.prepare("SELECT * FROM records WHERE id=?").get(Number(req.params.id));
  if (!row) return res.status(404).json({error:"Record not found"});
  await db.prepare("DELETE FROM records WHERE id=?").run(row.id);
  await audit(req,"delete",`${row.module} #${row.id}`);
  res.json({ok:true});
}));
app.get("/api/dashboard",auth,route(async (req,res) => {
  const rows=(await db.prepare("SELECT module,data,created_at FROM records").all()).map(r=>({...r,data:JSON.parse(r.data)}));
  const today=new Date().toISOString().slice(0,10);
  const sum=(arr,key)=>arr.reduce((n,r)=>n+(Number(r.data[key])||0),0);
  const of=m=>rows.filter(r=>r.module===m);
  const todayOf=m=>of(m).filter(r=>(r.data.date||"")===today);
  const sales=of("sales"), payments=of("debtor_payment"), purchases=of("purchase"), supplierPayments=of("supplier_payment"), expenses=of("expense"), production=of("production");
  const salesValue=sum(sales,"total"), expensesValue=sum(expenses,"amount"), customerBalances={};
  sales.filter(r=>["credit","part-paid"].includes(String(r.data.payment_status||"").toLowerCase())).forEach(r=>{
    const k=String(r.data.customer||"Unknown"); customerBalances[k]=(customerBalances[k]||0)+(Number(r.data.total)||0);
  });
  payments.forEach(r=>{const k=String(r.data.customer||"Unknown");customerBalances[k]=(customerBalances[k]||0)-(Number(r.data.amount)||0);});
  const debt=Object.values(customerBalances).reduce((a,b)=>a+Math.max(0,b),0), supplierBalances={};
  purchases.forEach(r=>{const k=String(r.data.supplier||"Unknown");supplierBalances[k]=(supplierBalances[k]||0)+(Number(r.data.total)||0);});
  supplierPayments.forEach(r=>{const k=String(r.data.supplier||"Unknown");supplierBalances[k]=(supplierBalances[k]||0)-(Number(r.data.amount)||0);});
  const supplierDue=Object.values(supplierBalances).reduce((a,b)=>a+Math.max(0,b),0);
  const recent=await db.prepare("SELECT r.id,r.module,r.data,r.created_at,u.full_name FROM records r LEFT JOIN users u ON u.id=r.created_by ORDER BY r.id DESC LIMIT 8").all();
  res.json({
    todaySales:sum(todayOf("sales"),"total"),totalSales:salesValue,debts:Math.max(0,debt),expenses:expensesValue,supplierDue:Math.max(0,supplierDue),
    todayProduction:sum(todayOf("production"),"good_loaves"),flourToday:sum(todayOf("production"),"flour_bags"),
    stockMovement:{received:sum(of("stock_in"),"quantity"),issued:sum(of("stock_out"),"quantity")},
    breadReturned:sum(of("return"),"quantity"),breadDispatched:sum(of("dispatch"),"quantity"),
    production:{produced:sum(production,"loaves_produced"),recycled:sum(production,"recycled"),damaged:sum(production,"damaged")},
    recent:recent.map(r=>({...r,data:JSON.parse(r.data)}))
  });
}));
app.get("/api/users",auth,route(async (req,res) => {
  if(req.session.user.role!=="admin") return res.status(403).json({error:"Admin only"});
  res.json(await db.prepare("SELECT id,username,full_name,role,active,created_at FROM users ORDER BY id").all());
}));
app.post("/api/users",auth,route(async (req,res) => {
  if(req.session.user.role!=="admin") return res.status(403).json({error:"Admin only"});
  const {username,password,full_name,role}=req.body||{};
  if(!username||!password||!full_name||!roles[role]) return res.status(400).json({error:"Complete all fields and select a valid role"});
  try {
    const x=await db.prepare("INSERT INTO users(username,password_hash,full_name,role) VALUES(?,?,?,?)").run(username,bcrypt.hashSync(password,12),full_name,role);
    await audit(req,"create user",username); res.json({id:Number(x.lastInsertRowid)});
  } catch(e) { res.status(400).json({error:"Username already exists"}); }
}));
app.post("/api/users/:id/active",auth,route(async (req,res) => {
  if(req.session.user.role!=="admin") return res.status(403).json({error:"Admin only"});
  await db.prepare("UPDATE users SET active=? WHERE id=?").run(req.body.active?1:0,Number(req.params.id));
  await audit(req,"change user status",req.params.id); res.json({ok:true});
}));
app.get("/api/audit",auth,route(async (req,res) => {
  if(req.session.user.role!=="admin") return res.status(403).json({error:"Admin only"});
  res.json(await db.prepare("SELECT a.*,u.username FROM audit a LEFT JOIN users u ON u.id=a.user_id ORDER BY a.id DESC LIMIT 200").all());
}));
const upload=multer({
  storage:multer.diskStorage({
    destination:(req,file,cb)=>cb(null,path.join(DATA_DIR,"uploads")),
    filename:(req,file,cb)=>cb(null,"bakery-logo.png")
  }),
  limits:{fileSize:2*1024*1024},
  fileFilter:(req,file,cb)=>cb(null,file.mimetype==="image/png")
});
app.post("/api/logo",auth,(req,res,next)=>{
  if(req.session.user.role!=="admin") return res.status(403).json({error:"Admin only"});
  next();
},upload.single("logo"),route(async (req,res) => {
  if(!req.file) return res.status(400).json({error:"Please upload a PNG file"});
  const url="/uploads/bakery-logo.png?v="+Date.now();
  await db.prepare("INSERT INTO settings(key,value) VALUES('logo',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(url);
  await audit(req,"update bakery logo",url); res.json({logo:url});
}));
app.get("/api/export.csv",auth,route(async (req,res) => {
  const rows=await db.prepare("SELECT id,module,data,created_at FROM records ORDER BY id DESC").all();
  const esc=v=>'"'+String(v??"").replace(/"/g,'""')+'"';
  const lines=["id,module,date,description,quantity,total,amount,created_at"];
  rows.forEach(r=>{const d=JSON.parse(r.data);lines.push([r.id,r.module,d.date,d.description||d.product||d.material||d.customer||"",d.quantity||"",d.total||"",d.amount||"",r.created_at].map(esc).join(","));});
  res.setHeader("Content-Type","text/csv");res.setHeader("Content-Disposition",'attachment; filename="cmc-bakery-records.csv"');res.send(lines.join("\n"));
}));
app.get("*",(req,res)=>res.sendFile(path.join(__dirname,"public","index.html")));

async function start() {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS users(
      id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL, full_name TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'staff',
      active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS records(
      id INTEGER PRIMARY KEY AUTOINCREMENT, module TEXT NOT NULL, data TEXT NOT NULL,
      created_by INTEGER, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(created_by) REFERENCES users(id)
    );
    CREATE TABLE IF NOT EXISTS audit(
      id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, action TEXT NOT NULL,
      details TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY, value TEXT);
  `);
  const count=await db.prepare("SELECT COUNT(*) AS n FROM users").get();
  if(!Number(count?.n)) {
    const username=process.env.ADMIN_USERNAME||"admin";
    const password=process.env.ADMIN_PASSWORD;
    if(!password) throw new Error("Set ADMIN_PASSWORD in Render before first deployment.");
    await db.prepare("INSERT INTO users(username,password_hash,full_name,role) VALUES(?,?,?,?)")
      .run(username,bcrypt.hashSync(password,12),"CMC Bakery Administrator","admin");
    console.log(`Initial admin created: ${username}.`);
  }
  app.listen(PORT,()=>console.log(`CMC Bakery running on port ${PORT} with Turso database`));
}
start().catch(err=>{console.error("Startup failed:",err);process.exit(1);});
app.use((err,req,res,next)=>{
  console.error(err);
  if(res.headersSent) return next(err);
  res.status(500).json({error:"An unexpected server error occurred"});
});
