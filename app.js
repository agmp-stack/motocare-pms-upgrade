const $ = (id) => document.getElementById(id);

let currentUser = null;
let appointments = [];

function showMessage(el, text, type = "error") {
  el.textContent = text || "";
  el.className = `form-message ${type}`;
}

function openModal() {
  $("modal").classList.remove("hidden");
}
function closeModal() {
  $("modal").classList.add("hidden");
}
function openEditModal() {
  $("editModal").classList.remove("hidden");
}
function closeEditModal() {
  $("editModal").classList.add("hidden");
}

async function api(url, options = {}) {
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Something went wrong.");
  return data;
}

function setMinDates() {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  const min = local.toISOString().slice(0, 10);
  $("date").min = min;
  $("editDate").min = min;
}

function buildTimes(select, date) {
  select.innerHTML = "";
  if (!date) {
    select.innerHTML = '<option value="">Select a date first</option>';
    return;
  }

  const d = new Date(`${date}T00:00:00`);
  if (Number.isNaN(d.getTime()) || d.getDay() === 0) {
    select.innerHTML = '<option value="">Sunday is unavailable</option>';
    return;
  }

  const lastHour = d.getDay() === 6 ? 21 : 17;
  for (let hour = 8; hour <= lastHour; hour++) {
    for (const minute of [0, 30]) {
      if (hour === lastHour && minute === 30) continue;
      const value = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
      const label = new Date(`2000-01-01T${value}:00`).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
      select.add(new Option(label, value));
    }
  }
}

function updateSlotHelp() {
  const date = $("date").value;
  const help = $("slotHelp");
  if (!date) {
    help.textContent = "Select a date to see available hours.";
    return;
  }
  const d = new Date(`${date}T00:00:00`);
  if (d.getDay() === 0) {
    help.textContent = "Sunday is closed. Please choose Monday–Saturday.";
    return;
  }
  help.textContent = d.getDay() === 6
    ? "Saturday hours: 8:00 AM–9:00 PM."
    : "Weekday hours: 8:00 AM–5:00 PM.";
}

function renderAuthState() {
  const loggedIn = Boolean(currentUser);
  $("loginNavBtn").classList.toggle("hidden", loggedIn);
  $("logoutBtn").classList.toggle("hidden", !loggedIn);
  $("dashboard").classList.toggle("hidden", !loggedIn);
  $("authNotice").classList.toggle("hidden", loggedIn);
  $("welcomeName").textContent = loggedIn ? `${currentUser.first_name} ${currentUser.surname}` : "Customer";
  $("accountRole").textContent = loggedIn ? (currentUser.role === "admin" ? "Administrator" : "Customer") : "";
  $("adminPanel").classList.toggle("hidden", !loggedIn || currentUser.role !== "admin");
}

function renderAppointments() {
  const list = $("appointmentsList");
  if (!appointments.length) {
    list.innerHTML = `<div class="appointment"><div><h4>No appointments yet</h4><p>Book your first PMS or upgrade schedule above.</p></div></div>`;
    return;
  }

  list.innerHTML = appointments.map(a => {
    const customer = currentUser?.role === "admin"
      ? `<p><strong>${escapeHtml(a.first_name)} ${escapeHtml(a.surname)}</strong> • ${escapeHtml(a.phone)} • ${escapeHtml(a.email)}</p>`
      : "";
    return `
      <article class="appointment">
        <div>
          <h4>${escapeHtml(a.service_type)} • ${escapeHtml(a.motorcycle_plate)}</h4>
          <p>${formatDate(a.appointment_date)} at ${formatTime(a.appointment_time)}</p>
          <p>${escapeHtml(a.service_notes || "No additional notes.")}</p>
          ${customer}
        </div>
        <div><span class="status ${escapeHtml(a.status)}">${escapeHtml(a.status)}</span></div>
        <div class="actions">
          <button class="small-btn" onclick="editAppointment(${a.id})">Edit</button>
          <button class="small-btn delete" onclick="deleteAppointment(${a.id})">Delete</button>
        </div>
      </article>
    `;
  }).join("");
}

function renderUsers(users) {
  $("usersList").innerHTML = `
    <div class="user-row"><strong>Name</strong><strong>Contact</strong><strong>Email</strong><strong>Role</strong></div>
    ${users.map(u => `
      <div class="user-row">
        <span>${escapeHtml(u.first_name)} ${escapeHtml(u.surname)}</span>
        <span>${escapeHtml(u.phone)}</span>
        <span>${escapeHtml(u.email)}</span>
        <span>${escapeHtml(u.role)}</span>
      </div>
    `).join("")}
  `;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, c => ({
    "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#039;"
  }[c]));
}

function formatDate(date) {
  return new Date(`${date}T00:00:00`).toLocaleDateString(undefined, {
    weekday: "short", month: "short", day: "numeric", year: "numeric"
  });
}

function formatTime(time) {
  return new Date(`2000-01-01T${time}:00`).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

async function loadAppointments() {
  if (!currentUser) return;
  const data = await api("/api/appointments");
  appointments = data.appointments;
  renderAppointments();

  if (currentUser.role === "admin") {
    const users = await api("/api/users");
    renderUsers(users.users);
  }
}

async function refreshUser() {
  const data = await api("/api/me");
  currentUser = data.user;
  renderAuthState();
  if (currentUser) await loadAppointments();
}

$("loginNavBtn").addEventListener("click", openModal);
$("closeModal").addEventListener("click", closeModal);
$("closeEditModal").addEventListener("click", closeEditModal);
document.querySelectorAll(".modal-backdrop").forEach(b => b.addEventListener("click", () => {
  closeModal(); closeEditModal();
}));

document.querySelectorAll(".auth-tabs button").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".auth-tabs button").forEach(x => x.classList.remove("active"));
    btn.classList.add("active");
    const login = btn.dataset.tab === "login";
    $("loginForm").classList.toggle("hidden", !login);
    $("registerForm").classList.toggle("hidden", login);
  });
});

$("logoutBtn").addEventListener("click", async () => {
  await api("/api/logout", { method: "POST" });
  currentUser = null;
  appointments = [];
  renderAuthState();
  window.location.hash = "home";
});

$("date").addEventListener("change", () => {
  buildTimes($("time"), $("date").value);
  updateSlotHelp();
});
$("editDate").addEventListener("change", () => buildTimes($("editTime"), $("editDate").value));

document.querySelectorAll(".service-select").forEach(btn => {
  btn.addEventListener("click", () => {
    $("serviceType").value = btn.dataset.service;
    document.getElementById("booking").scrollIntoView({ behavior: "smooth" });
  });
});

$("loginForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  try {
    const data = await api("/api/login", {
      method: "POST",
      body: JSON.stringify({
        email: $("loginEmail").value,
        password: $("loginPassword").value
      })
    });
    currentUser = data.user;
    closeModal();
    renderAuthState();
    await loadAppointments();
    showMessage($("appointmentMessage"), "You are logged in. Choose a schedule below.", "success");
  } catch (err) {
    showMessage($("loginMessage"), err.message);
  }
});

$("registerForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  try {
    const data = await api("/api/register", {
      method: "POST",
      body: JSON.stringify({
        firstName: $("regFirstName").value,
        surname: $("regSurname").value,
        phone: $("regPhone").value,
        email: $("regEmail").value,
        password: $("regPassword").value
      })
    });
    currentUser = data.user;
    closeModal();
    renderAuthState();
    await loadAppointments();
    showMessage($("appointmentMessage"), "Registration successful. You can now book an appointment.", "success");
  } catch (err) {
    showMessage($("registerMessage"), err.message);
  }
});

$("appointmentForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!currentUser) {
    openModal();
    showMessage($("loginMessage"), "Please log in or register before booking.");
    return;
  }

  try {
    await api("/api/appointments", {
      method: "POST",
      body: JSON.stringify({
        plateNumber: $("plateNumber").value,
        serviceType: $("serviceType").value,
        notes: $("notes").value,
        date: $("date").value,
        time: $("time").value
      })
    });
    showMessage($("appointmentMessage"), "Appointment requested successfully.", "success");
    $("appointmentForm").reset();
    buildTimes($("time"), "");
    updateSlotHelp();
    await loadAppointments();
    document.getElementById("dashboard").scrollIntoView({ behavior: "smooth" });
  } catch (err) {
    showMessage($("appointmentMessage"), err.message);
  }
});

$("refreshBtn").addEventListener("click", loadAppointments);

window.editAppointment = function(id) {
  const a = appointments.find(x => x.id === id);
  if (!a) return;
  $("editId").value = a.id;
  $("editPlate").value = a.motorcycle_plate;
  $("editService").value = a.service_type;
  $("editDate").value = a.appointment_date;
  buildTimes($("editTime"), a.appointment_date);
  $("editTime").value = a.appointment_time;
  $("editNotes").value = a.service_notes || "";
  $("editStatus").value = a.status;
  $("editStatusWrap").classList.toggle("hidden", currentUser.role !== "admin");
  $("editMessage").textContent = "";
  openEditModal();
};

window.deleteAppointment = async function(id) {
  if (!confirm("Delete this appointment? This cannot be undone.")) return;
  try {
    await api(`/api/appointments/${id}`, { method: "DELETE" });
    await loadAppointments();
  } catch (err) {
    alert(err.message);
  }
};

$("editForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  try {
    await api(`/api/appointments/${$("editId").value}`, {
      method: "PUT",
      body: JSON.stringify({
        plateNumber: $("editPlate").value,
        serviceType: $("editService").value,
        notes: $("editNotes").value,
        date: $("editDate").value,
        time: $("editTime").value,
        status: currentUser.role === "admin" ? $("editStatus").value : "Pending"
      })
    });
    closeEditModal();
    await loadAppointments();
  } catch (err) {
    showMessage($("editMessage"), err.message);
  }
});

setMinDates();
buildTimes($("time"), "");
buildTimes($("editTime"), "");

refreshUser().catch(console.error);
