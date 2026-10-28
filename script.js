/* HomeHub demo application: owner login + localStorage dashboard data.
   Demo credentials: owner@homehub.com / Owner@123
   Production apps need server-side authentication; do not use this demo as real security. */
const $ = (id) => document.getElementById(id);
const money = (n) => "₹" + Number(n || 0).toLocaleString("en-IN");
const todayISO = () => new Date().toISOString().slice(0, 10);
const safe = (value) => String(value ?? "").replace(/[&<>"']/g, ch => ({
  "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
}[ch]));
const store = {
  read(key, fallback) {
    try { const value = localStorage.getItem("homehub_" + key); return value ? JSON.parse(value) : fallback; }
    catch { return fallback; }
  },
  write(key, value) { localStorage.setItem("homehub_" + key, JSON.stringify(value)); }
};
let houses = store.read("houses", [
  {id:1,name:"Green Villa",location:"Civil Lines, Kanpur",rooms:4,rent:8000,notes:"Family rental"},
  {id:2,name:"Sunrise Residency",location:"Kakadeo, Kanpur",rooms:3,rent:6500,notes:"Near market"}
]);
let tenants = store.read("tenants", [
  {id:1,name:"Rahul Sharma",phone:"9876543210",houseId:1,room:"Room 101",rent:8000,moveIn:"2026-04-01"},
  {id:2,name:"Priya Verma",phone:"9123456780",houseId:2,room:"Room 201",rent:6500,moveIn:"2026-05-10"}
]);
let payments = store.read("payments", [
  {id:1,tenantId:1,houseId:1,amount:8000,dueDate:todayISO(),status:"Paid"},
  {id:2,tenantId:2,houseId:2,amount:6500,dueDate:todayISO(),status:"Pending"}
]);
let maintenance = store.read("maintenance", [
  {id:1,houseId:1,room:"Room 101",issue:"Bathroom tap leakage",status:"Open",date:todayISO(),details:"Tap needs repair"}
]);
let modalType = "";
let toastTimer;

let saveQueue = Promise.resolve();
function persist() {
  // Keep a local backup, and save the same records to MySQL through the Node API.
  store.write("houses", houses); store.write("tenants", tenants);
  store.write("payments", payments); store.write("maintenance", maintenance);
  const snapshot = {
    houses: JSON.parse(JSON.stringify(houses)),
    tenants: JSON.parse(JSON.stringify(tenants)),
    payments: JSON.parse(JSON.stringify(payments)),
    maintenance: JSON.parse(JSON.stringify(maintenance))
  };
  saveQueue = saveQueue.then(async () => {
    const response = await fetch("/api/data", {
      method: "PUT",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify(snapshot)
    });
    if (!response.ok) throw new Error(await response.text());
    setDatabaseStatus("Connected to MySQL · data saved", true);
  }).catch(error => {
    console.error("MySQL save failed:", error);
    setDatabaseStatus("MySQL save failed — check server / .env", false);
    toast("Database save failed. Check that the HomeHub server is running.");
  });
  return saveQueue;
}
function setDatabaseStatus(message, connected) {
  const el = $("databaseStatus");
  if (!el) return;
  el.textContent = message;
  el.style.color = connected ? "#15966b" : "#c62828";
}
async function initDatabase() {
  try {
    setDatabaseStatus("Connecting to MySQL…", true);
    const response = await fetch("/api/data");
    if (!response.ok) throw new Error(await response.text());
    const data = await response.json();
    const hasDatabaseRecords = ["houses","tenants","payments","maintenance"]
      .some(key => Array.isArray(data[key]) && data[key].length > 0);
    if (hasDatabaseRecords) {
      houses = data.houses || [];
      tenants = data.tenants || [];
      payments = data.payments || [];
      maintenance = data.maintenance || [];
      store.write("houses", houses); store.write("tenants", tenants);
      store.write("payments", payments); store.write("maintenance", maintenance);
    } else {
      // First run: migrate the demo/local records into MySQL so the dashboard is ready.
      await persist();
    }
    setDatabaseStatus("Connected to MySQL · data saved", true);
  } catch (error) {
    console.error("MySQL connection failed:", error);
    setDatabaseStatus("MySQL not connected — start server and check .env", false);
    toast("Cannot connect to database. Start HomeHub with npm start and check .env.");
  }
  renderAll();
}
function houseById(id) { return houses.find(h => h.id === Number(id)); }
function tenantById(id) { return tenants.find(t => t.id === Number(id)); }
function propertyName(id) { const h = houseById(id); return h ? h.name : "Property removed"; }
function tenantName(id) { const t = tenantById(id); return t ? t.name : "Unknown tenant"; }
function toast(message) {
  const el = $("toast"); el.textContent = message; el.classList.add("show");
  clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove("show"), 2600);
}
function nextId(list) { return Math.max(0, ...list.map(x => Number(x.id) || 0)) + 1; }
function showPage(page) {
  document.querySelectorAll(".page").forEach(el => el.classList.toggle("hidden", el.id !== page));
  document.querySelectorAll(".nav").forEach(el => el.classList.toggle("active", el.dataset.page === page));
  const titles = {dashboard:"Dashboard Overview",houses:"Houses & Rooms",tenants:"Tenant Management",payments:"Rent & Payments",maintenance:"Maintenance Requests",reports:"Reports & Analytics"};
  $("pageTitle").textContent = titles[page] || "HomeHub";
  $("quickAdd").textContent = page === "tenants" ? "+ Add Tenant" : page === "payments" ? "+ Add Payment" : page === "maintenance" ? "+ New Request" : "+ Add House";
  renderAll();
}
function pill(status) { return `<span class="pill ${safe(status.replaceAll(" ","-"))}">${safe(status)}</span>`; }
function emptyRow(cols, message) { return `<tr><td colspan="${cols}">${safe(message)}</td></tr>`; }
function houseOccupied(houseId) { return tenants.filter(t => t.houseId === houseId).length; }
function houseRooms(house) { return Math.max(0, Number(house.rooms) || 0); }
function renderDashboard() {
  const totalRooms = houses.reduce((s,h) => s + houseRooms(h), 0);
  const occupied = tenants.length;
  const vacant = Math.max(0, totalRooms - occupied);
  const expected = tenants.reduce((s,t) => s + Number(t.rent || 0), 0);
  const collected = payments.filter(p => p.status === "Paid").reduce((s,p) => s + Number(p.amount || 0), 0);
  const pending = payments.filter(p => p.status === "Pending").reduce((s,p) => s + Number(p.amount || 0), 0);
  const rate = totalRooms ? Math.min(100, Math.round(occupied / totalRooms * 100)) : 0;
  const collectionRate = collected + pending ? Math.round(collected / (collected + pending) * 100) : 0;
  $("totalHouses").textContent = houses.length; $("occupiedRooms").textContent = occupied;
  $("vacantRooms").textContent = vacant; $("monthlyRent").textContent = money(expected);
  $("occupiedLegend").textContent = occupied; $("vacantLegend").textContent = vacant; $("totalRooms").textContent = totalRooms;
  $("occupancyRate").textContent = rate + "%";
  $("occupancyDonut").style.background = `conic-gradient(var(--green) ${rate * 3.6}deg,#edf0f6 0deg)`;
  $("collectedAmount").textContent = money(collected); $("collectionRate").textContent = collectionRate + "%";
  $("collectionProgress").style.width = collectionRate + "%";
  $("pendingSummary").textContent = pending ? `${money(pending)} rent pending` : "No pending payments";
  $("recentPayments").innerHTML = [...payments].slice(-5).reverse().map(p => `<tr><td>${safe(tenantName(p.tenantId))}</td><td>${safe(propertyName(p.houseId))}</td><td>${money(p.amount)}</td><td>${safe(p.dueDate)}</td><td>${pill(p.status)}</td></tr>`).join("") || emptyRow(5,"No payment records yet.");
  $("recentMaintenance").innerHTML = [...maintenance].slice(-4).reverse().map(m => `<div class="request-item"><div><strong>${safe(m.issue)}</strong><div class="muted">${safe(propertyName(m.houseId))} · ${safe(m.date)}</div></div>${pill(m.status)}</div>`).join("") || `<div class="empty-state">No maintenance requests yet.</div>`;
}
function renderHouses() {
  const q = ($("houseSearch").value || "").toLowerCase(), filter = $("houseFilter").value;
  const list = houses.filter(h => {
    const status = houseOccupied(h.id) >= houseRooms(h) ? "Occupied" : "Vacant";
    return (h.name + " " + h.location).toLowerCase().includes(q) && (filter === "all" || status === filter);
  });
  $("houseGrid").innerHTML = list.map(h => {
    const occupied = houseOccupied(h.id), vacant = Math.max(0, houseRooms(h) - occupied);
    return `<article class="house-card"><h3>${safe(h.name)}</h3><p>📍 ${safe(h.location)}</p><div class="house-meta"><span>Total rooms<br><strong>${houseRooms(h)}</strong></span><span>Occupied<br><strong>${occupied}</strong></span><span>Vacant<br><strong>${vacant}</strong></span><span>Monthly rent<br><strong>${money(h.rent)}</strong></span></div><p>${safe(h.notes || "No additional details")}</p><div class="card-actions"><button class="action-btn" data-edit-house="${h.id}">Edit</button><button class="action-btn danger" data-delete-house="${h.id}">Delete</button></div></article>`;
  }).join("") || `<div class="empty-state">No houses found. Click “Add House” to create one.</div>`;
}
function renderTenants() {
  const q = ($("tenantSearch").value || "").toLowerCase();
  const list = tenants.filter(t => (t.name+" "+t.phone+" "+t.room+" "+propertyName(t.houseId)).toLowerCase().includes(q));
  $("tenantTable").innerHTML = list.map(t => `<tr><td><strong>${safe(t.name)}</strong></td><td>${safe(t.phone)}</td><td>${safe(propertyName(t.houseId))} / ${safe(t.room)}</td><td>${money(t.rent)}</td><td>${safe(t.moveIn)}</td><td><button class="action-btn" data-edit-tenant="${t.id}">Edit</button> <button class="action-btn danger" data-delete-tenant="${t.id}">Delete</button></td></tr>`).join("") || emptyRow(6,"No tenants found.");
}
function renderPayments() {
  const q = ($("paymentSearch").value || "").toLowerCase(), filter = $("paymentFilter").value;
  const list = payments.filter(p => (tenantName(p.tenantId)+" "+propertyName(p.houseId)).toLowerCase().includes(q) && (filter === "all" || p.status === filter));
  $("paymentTotal").textContent = money(payments.reduce((s,p)=>s+Number(p.amount||0),0));
  $("paymentCollected").textContent = money(payments.filter(p=>p.status==="Paid").reduce((s,p)=>s+Number(p.amount||0),0));
  $("paymentPending").textContent = money(payments.filter(p=>p.status==="Pending").reduce((s,p)=>s+Number(p.amount||0),0));
  $("paymentTable").innerHTML = list.map(p => `<tr><td>${safe(tenantName(p.tenantId))}</td><td>${safe(propertyName(p.houseId))}</td><td>${money(p.amount)}</td><td>${safe(p.dueDate)}</td><td>${pill(p.status)}</td><td>${p.status==="Pending"?`<button class="action-btn" data-paid="${p.id}">Mark Paid</button>`:""} <button class="action-btn danger" data-delete-payment="${p.id}">Delete</button></td></tr>`).join("") || emptyRow(6,"No payments found.");
}
function renderMaintenance() {
  const q = ($("maintenanceSearch").value || "").toLowerCase(), filter = $("maintenanceFilter").value;
  const list = maintenance.filter(m => (m.issue+" "+propertyName(m.houseId)+" "+m.room).toLowerCase().includes(q) && (filter === "all" || m.status === filter));
  $("maintenanceGrid").innerHTML = list.map(m => `<article class="maintenance-card"><div class="panel-heading"><h3>${safe(m.issue)}</h3>${pill(m.status)}</div><p>🏠 ${safe(propertyName(m.houseId))}<br>🚪 ${safe(m.room || "Not specified")}<br>📅 ${safe(m.date)}</p><p>${safe(m.details || "")}</p><div class="card-actions"><button class="action-btn" data-cycle-maintenance="${m.id}">Next status</button><button class="action-btn danger" data-delete-maintenance="${m.id}">Delete</button></div></article>`).join("") || `<div class="empty-state">No maintenance requests found.</div>`;
}
function renderReports() {
  const collected = payments.filter(p=>p.status==="Paid").reduce((s,p)=>s+Number(p.amount||0),0);
  const pending = payments.filter(p=>p.status==="Pending").reduce((s,p)=>s+Number(p.amount||0),0);
  $("reportHouses").textContent = houses.length; $("reportTenants").textContent = tenants.length;
  $("reportCollected").textContent = money(collected); $("reportPending").textContent = money(pending);
  $("reportTable").innerHTML = houses.map(h => {const occ=houseOccupied(h.id),rooms=houseRooms(h);return `<tr><td>${safe(h.name)}</td><td>${safe(h.location)}</td><td>${rooms}</td><td>${occ}</td><td>${Math.max(0,rooms-occ)}</td><td>${money(h.rent)}</td></tr>`}).join("") || emptyRow(6,"No properties available.");
}
function renderAll() { renderDashboard(); renderHouses(); renderTenants(); renderPayments(); renderMaintenance(); renderReports(); }
function openModal(type, record = null) {
  modalType = type; $("modalForm").dataset.recordId = record ? record.id : "";
  const config = {
    house: {title:record?"Edit House":"Add House", fields:[
      ["name","House / Property Name","text",record?.name||"",true],
      ["location","Location","text",record?.location||"",true],
      ["rooms","Total Rooms","number",record?.rooms??1,true],
      ["rent","Monthly Rent (₹)","number",record?.rent??0,true],
      ["notes","Notes","text",record?.notes||"",false,"full"]]},
    tenant: {title:record?"Edit Tenant":"Add Tenant", fields:[
      ["name","Tenant Name","text",record?.name||"",true],
      ["phone","Phone Number (10 digits)","tel",record?.phone||"",true],
      ["houseId","Property","select",record?.houseId||houses[0]?.id||"",true],
      ["room","Room Number / Name","text",record?.room||"",true],
      ["rent","Monthly Rent (₹)","number",record?.rent??0,true],
      ["moveIn","Move-in Date","date",record?.moveIn||todayISO(),true]]},
    payment: {title:"Add Rent Payment", fields:[
      ["tenantId","Tenant","select",record?.tenantId||tenants[0]?.id||"",true],
      ["houseId","Property","select",record?.houseId||houses[0]?.id||"",true],
      ["amount","Amount (₹)","number",record?.amount??"",true],
      ["dueDate","Due Date","date",record?.dueDate||todayISO(),true],
      ["status","Payment Status","select",record?.status||"Pending",true]]},
    maintenance: {title:"New Maintenance Request", fields:[
      ["houseId","Property","select",record?.houseId||houses[0]?.id||"",true],
      ["room","Room","text",record?.room||"",true],
      ["issue","Issue / Complaint","text",record?.issue||"",true],
      ["date","Request Date","date",record?.date||todayISO(),true],
      ["status","Status","select",record?.status||"Open",true],
      ["details","Details","text",record?.details||"","", "full"]]}
  };
  const cfg = config[type]; $("modalTitle").textContent = cfg.title;
  $("modalFields").innerHTML = cfg.fields.map(([name,label,kind,value,required,span]) => {
    let input = "";
    if (kind === "select") {
      let opts = [];
      if (name === "houseId") opts = houses.map(h=>[h.id,h.name]);
      if (name === "tenantId") opts = tenants.map(t=>[t.id,t.name]);
      if (name === "status" && type === "payment") opts = [["Pending","Pending"],["Paid","Paid"]];
      if (name === "status" && type === "maintenance") opts = [["Open","Open"],["In Progress","In Progress"],["Resolved","Resolved"]];
      input = `<select name="${name}" ${required?"required":""}>${opts.map(([v,l])=>`<option value="${safe(v)}" ${String(v)===String(value)?"selected":""}>${safe(l)}</option>`).join("")}</select>`;
    } else input = `<input name="${name}" type="${kind}" value="${safe(value)}" ${required?"required":""} ${kind==="number"?'min="0"':''} ${name==="phone"?'maxlength="10" pattern="[0-9]{10}"':''}>`;
    return `<div class="field ${span==="full"?"full":""}"><label>${safe(label)}</label>${input}</div>`;
  }).join("");
  $("modal").classList.remove("hidden");
}
function closeModal() { $("modal").classList.add("hidden"); $("modalForm").reset(); }
function formData(form) {
  const result = Object.fromEntries(new FormData(form).entries());
  ["rooms","rent","amount","houseId","tenantId"].forEach(k => {if(result[k] !== undefined && result[k] !== "") result[k] = Number(result[k]);});
  return result;
}
function saveModal(event) {
  event.preventDefault();
  const form = $("modalForm"), data = formData(form), id = Number(form.dataset.recordId);
  if (modalType === "house") {
    if (id) houses = houses.map(x => x.id === id ? {...x,...data,id} : x);
    else houses.push({...data,id:nextId(houses)});
  } else if (modalType === "tenant") {
    if (id) tenants = tenants.map(x => x.id === id ? {...x,...data,id} : x);
    else tenants.push({...data,id:nextId(tenants)});
  } else if (modalType === "payment") {
    payments.push({...data,id:nextId(payments)});
  } else if (modalType === "maintenance") {
    maintenance.push({...data,id:nextId(maintenance)});
  }
  persist(); closeModal(); renderAll(); toast("Record saved successfully.");
}
function deleteRecord(listName, id) {
  if (!confirm("Are you sure you want to delete this record?")) return;
  if (listName==="house") {
    if (tenants.some(t=>t.houseId===id)) { toast("Move or delete this house's tenants first."); return; }
    houses = houses.filter(x=>x.id!==id);
  }
  if (listName==="tenant") tenants = tenants.filter(x=>x.id!==id);
  if (listName==="payment") payments = payments.filter(x=>x.id!==id);
  if (listName==="maintenance") maintenance = maintenance.filter(x=>x.id!==id);
  persist(); renderAll(); toast("Record deleted.");
}
function exportCSV() {
  const rows = [["Property","Location","Rooms","Occupied","Vacant","Monthly Rent"], ...houses.map(h=>[h.name,h.location,h.rooms,houseOccupied(h.id),Math.max(0,houseRooms(h)-houseOccupied(h.id)),h.rent])];
  const csv = rows.map(row=>row.map(v=>`"${String(v??"").replace(/"/g,'""')}"`).join(",")).join("\r\n");
  const blob = new Blob(["\ufeff"+csv],{type:"text/csv;charset=utf-8;"});
  const url = URL.createObjectURL(blob), a = document.createElement("a");
  a.href=url; a.download="homehub-report.csv"; a.click(); URL.revokeObjectURL(url);
}
function doLogout() {
  $("appShell").classList.add("hidden"); $("loginScreen").classList.remove("hidden");
  $("ownerPassword").value=""; $("ownerEmail").value=""; $("loginError").textContent="";
}
function wireEvents() {
  document.querySelectorAll(".nav").forEach(btn=>btn.addEventListener("click",()=>showPage(btn.dataset.page)));
  document.querySelectorAll("[data-goto]").forEach(btn=>btn.addEventListener("click",()=>showPage(btn.dataset.goto)));
  $("addHouse").addEventListener("click",()=>openModal("house"));
  $("addTenant").addEventListener("click",()=>{if(!houses.length){toast("Please add a house first.");return;}openModal("tenant");});
  $("addPayment").addEventListener("click",()=>{if(!tenants.length||!houses.length){toast("Add a house and tenant first.");return;}openModal("payment");});
  $("addMaintenance").addEventListener("click",()=>{if(!houses.length){toast("Please add a house first.");return;}openModal("maintenance");});
  $("quickAdd").addEventListener("click",()=>{const page=document.querySelector(".nav.active")?.dataset.page;const type=page==="tenants"?"tenant":page==="payments"?"payment":page==="maintenance"?"maintenance":"house";if(type!=="house"&&!houses.length){toast("Please add a house first.");return;}if(type==="payment"&&!tenants.length){toast("Please add a tenant first.");return;}openModal(type);});
  $("closeModal").addEventListener("click",closeModal); $("cancelModal").addEventListener("click",closeModal);
  $("modal").addEventListener("click",e=>{if(e.target===$("modal"))closeModal();});
  $("modalForm").addEventListener("submit",saveModal);
  $("houseSearch").addEventListener("input",renderHouses); $("houseFilter").addEventListener("change",renderHouses);
  $("tenantSearch").addEventListener("input",renderTenants); $("paymentSearch").addEventListener("input",renderPayments); $("paymentFilter").addEventListener("change",renderPayments);
  $("maintenanceSearch").addEventListener("input",renderMaintenance); $("maintenanceFilter").addEventListener("change",renderMaintenance);
  $("exportReport").addEventListener("click",exportCSV); $("logoutBtn").addEventListener("click",doLogout);
  $("globalSearch").addEventListener("keydown",e=>{if(e.key==="Enter"){const q=e.target.value.trim();if(!q)return;showPage("houses");$("houseSearch").value=q;renderHouses();}});
  document.addEventListener("click",e=>{
    const b=e.target.closest("button"); if(!b)return;
    if(b.dataset.editHouse) openModal("house",houses.find(x=>x.id===Number(b.dataset.editHouse)));
    if(b.dataset.editTenant) openModal("tenant",tenants.find(x=>x.id===Number(b.dataset.editTenant)));
    if(b.dataset.deleteHouse) deleteRecord("house",Number(b.dataset.deleteHouse));
    if(b.dataset.deleteTenant) deleteRecord("tenant",Number(b.dataset.deleteTenant));
    if(b.dataset.deletePayment) deleteRecord("payment",Number(b.dataset.deletePayment));
    if(b.dataset.deleteMaintenance) deleteRecord("maintenance",Number(b.dataset.deleteMaintenance));
    if(b.dataset.paid){const p=payments.find(x=>x.id===Number(b.dataset.paid));if(p){p.status="Paid";persist();renderAll();toast("Payment marked as paid.");}}
    if(b.dataset.cycleMaintenance){const m=maintenance.find(x=>x.id===Number(b.dataset.cycleMaintenance));if(m){m.status=({"Open":"In Progress","In Progress":"Resolved","Resolved":"Open"})[m.status];persist();renderAll();toast("Maintenance status updated.");}}
  });
}
$("today").textContent = new Date().toLocaleDateString("en-IN",{weekday:"long",year:"numeric",month:"long",day:"numeric"});
$("ownerLoginForm").addEventListener("submit",event=>{
  event.preventDefault();
  const email=$("ownerEmail").value.trim().toLowerCase(), password=$("ownerPassword").value;
  if(email==="owner@homehub.com" && password==="Owner@123"){
    $("loginError").textContent=""; $("loginScreen").classList.add("hidden"); $("appShell").classList.remove("hidden");
    $("ownerLoginForm").reset(); $("ownerPassword").type="password"; $("togglePassword").textContent="Show";
    showPage("dashboard");
  } else $("loginError").textContent="Invalid email or password. Please try again.";
});
$("togglePassword").addEventListener("click",()=>{
  const input=$("ownerPassword"), showing=input.type==="password";
  input.type=showing?"text":"password"; $("togglePassword").textContent=showing?"Hide":"Show";
});
wireEvents(); initDatabase();
