const SCRIPT_URL = "GANTI_DENGAN_DEPLOYMENT_URL_APPS_SCRIPT_ANDA";

let currentStart = 0;
const limit = 20;
let isAdminMode = false;
let pollingTimer = null;
let streamInstance = null;

document.addEventListener("DOMContentLoaded", () => {
  initApp();
  initSecurity();
});

function initApp() {
  fetchPaketData();
  fetchLaporan();

  // Event Listeners
  document.getElementById("btn-toggle-paket").addEventListener("click", togglePaketInput);
  document.getElementById("btn-beli").addEventListener("click", processBeli);
  document.getElementById("btn-reset").addEventListener("click", resetForm);
  document.getElementById("btn-foto").addEventListener("click", openCameraModal);
  document.getElementById("btn-close-cam").addEventListener("click", closeCameraModal);
  document.getElementById("btn-capture").addEventListener("click", captureAndOCR);
  document.getElementById("btn-close-select").addEventListener("click", () => {
    document.getElementById("modal-select-nomor").classList.add("hidden");
  });

  document.getElementById("btn-simpan-kasir").addEventListener("click", simpanTrxKasir);
  document.getElementById("btn-toggle-kasir-mode").addEventListener("click", toggleKasirMode);
  document.getElementById("btn-prev").addEventListener("click", () => navigatePage(-1));
  document.getElementById("btn-next").addEventListener("click", () => navigatePage(1));

  // Admin activation via double-click
  document.getElementById("th-nomor").addEventListener("dblclick", promptAdminPin);

  // Auto Input Format 08
  const nomorInput = document.getElementById("nomor-hp");
  nomorInput.addEventListener("input", (e) => {
    let val = e.target.value.replace(/\D/g, "");
    if (val.length > 0 && !val.startsWith("08")) {
      if (val.startsWith("8")) val = "0" + val;
    }
    e.target.value = val;
  });
}

// SECURITY PREVENTIONS
function initSecurity() {
  document.addEventListener("keydown", (e) => {
    if (
      e.key === "F12" ||
      (e.ctrlKey && e.shiftKey && (e.key === "I" || e.key === "J")) ||
      (e.ctrlKey && e.key === "u")
    ) {
      e.preventDefault();
    }
  });
}

// API CALLS
async function fetchPaketData() {
  try {
    const res = await fetch(`${SCRIPT_URL}?action=getPaket`);
    const data = await res.json();
    if (data.success) {
      const select = document.getElementById("select-paket");
      select.innerHTML = '<option value="">-- Pilih Paket Data --</option>';
      data.data.forEach(p => {
        const opt = document.createElement("option");
        opt.value = p; opt.textContent = p;
        select.appendChild(opt);
      });
    }
  } catch (err) {
    console.error("Gagal mengambil paket:", err);
  }
}

function togglePaketInput() {
  const select = document.getElementById("select-paket");
  const manual = document.getElementById("paket-manual");
  if (manual.classList.contains("hidden")) {
    manual.classList.remove("hidden");
    select.classList.add("hidden");
  } else {
    manual.classList.add("hidden");
    select.classList.remove("hidden");
  }
}

async function processBeli() {
  const nomor = document.getElementById("nomor-hp").value.trim();
  const selectPaket = document.getElementById("select-paket").value;
  const manualPaket = document.getElementById("paket-manual").value;
  const paket = manualPaket || selectPaket;

  if (nomor.length < 10 || !paket) {
    alert("Masukkan nomor HP yang valid (min. 10 digit) dan pilih paket.");
    return;
  }

  showLayer(2);

  try {
    const res = await fetch(SCRIPT_URL, {
      method: "POST",
      body: JSON.stringify({ action: "create", nomor, paket })
    });
    const data = await res.json();

    if (data.success) {
      startPollingStatus(data.id, data.nomor, data.paket);
    } else {
      alert("Gagal membuat pesanan.");
      showLayer(1);
    }
  } catch (err) {
    alert("Terjadi kesalahan jaringan.");
    showLayer(1);
  }
}

function startPollingStatus(id, nomor, paket) {
  pollingTimer = setInterval(async () => {
    try {
      const res = await fetch(`${SCRIPT_URL}?action=check&id=${id}`);
      const data = await res.json();
      
      if (data.success && data.status === "Selesai") {
        clearInterval(pollingTimer);
        document.getElementById("struk-id").textContent = id;
        document.getElementById("struk-nomor").textContent = nomor;
        document.getElementById("struk-paket").textContent = paket;
        showLayer(3);
        speakText("Transaksi berhasil. Terima kasih!");
        fetchLaporan();
      }
    } catch (err) {
      console.error(err);
    }
  }, 3000);
}

function showLayer(layerNum) {
  document.getElementById("layer-1").classList.add("hidden");
  document.getElementById("layer-2").classList.add("hidden");
  document.getElementById("layer-3").classList.add("hidden");
  document.getElementById(`layer-${layerNum}`).classList.remove("hidden");
}

function resetForm() {
  document.getElementById("nomor-hp").value = "";
  document.getElementById("select-paket").value = "";
  document.getElementById("paket-manual").value = "";
  showLayer(1);
}

// LAPORAN & ADMIN MODE
async function fetchLaporan() {
  const pin = localStorage.getItem("admin_pin") || "";
  try {
    const res = await fetch(`${SCRIPT_URL}?action=getPembeli&start=${currentStart}&limit=${limit}&pin=${pin}`);
    const data = await res.json();

    if (data.success) {
      isAdminMode = data.isAdmin;
      renderTable(data.data);
      toggleAdminUI();
    }
  } catch (err) {
    console.error("Gagal memuat laporan:", err);
  }
}

function renderTable(list) {
  const tbody = document.getElementById("tbody-laporan");
  tbody.innerHTML = "";

  if (list.length === 0) {
    tbody.innerHTML = '<tr><td colspan="4" class="text-center">Belum ada transaksi.</td></tr>';
    return;
  }

  list.forEach(item => {
    const tr = document.createElement("tr");

    let tagihTd = "";
    if (isAdminMode) {
      const waMsg = encodeURIComponent(`Halo, tagihan untuk transaksi ${item.tipe} di ARDAF STORE dengan status masih ${item.status}. Mohon diselesaikan.`);
      tagihTd = item.status === "Pending" 
        ? `<td><a href="https://wa.me/62${item.nomorRaw.replace(/^0/, '')}?text=${waMsg}" target="_blank" class="btn-wa">💬 TAGIH</a></td>`
        : `<td>-</td>`;
    }

    const selectDisabled = item.status === "Selesai" ? "disabled" : "";

    tr.innerHTML = `
      <td>${item.nomor}</td>
      <td>${item.tipe}</td>
      <td>
        <select onchange="updateItemStatus('${item.id}', this)" ${selectDisabled}>
          <option value="Pending" ${item.status === "Pending" ? "selected" : ""}>Pending</option>
          <option value="Selesai" ${item.status === "Selesai" ? "selected" : ""}>Selesai</option>
        </select>
      </td>
      ${isAdminMode ? tagihTd : ""}
    `;
    tbody.appendChild(tr);
  });
}

function toggleAdminUI() {
  const thTagih = document.getElementById("th-tagih");
  if (isAdminMode) {
    thTagih.classList.remove("hidden");
  } else {
    thTagih.classList.add("hidden");
  }
}

async function updateItemStatus(id, selectEl) {
  if (selectEl.value === "Selesai") {
    if (confirm("Apakah Anda yakin ingin mengubah status menjadi Selesai/Lunas?")) {
      selectEl.disabled = true;
      try {
        await fetch(SCRIPT_URL, {
          method: "POST",
          body: JSON.stringify({ action: "updateStatus", id, status: "Selesai" })
        });
        fetchLaporan();
      } catch (err) {
        alert("Gagal memperbarui status.");
        selectEl.disabled = false;
      }
    } else {
      selectEl.value = "Pending";
    }
  }
}

function promptAdminPin() {
  const pin = prompt("Masukkan PIN Admin:");
  if (pin) {
    localStorage.setItem("admin_pin", pin);
    fetchLaporan();
  }
}

async function simpanTrxKasir() {
  const nomor = document.getElementById("kasir-id").value.trim();
  const tipe = document.getElementById("kasir-tipe").value;
  const status = document.getElementById("kasir-status").value;

  if (!nomor) return alert("Isi nomor/ID pelanggan.");

  try {
    await fetch(SCRIPT_URL, {
      method: "POST",
      body: JSON.stringify({ action: "catat_trx_konter", nomor, tipe, status })
    });
    document.getElementById("kasir-id").value = "";
    fetchLaporan();
  } catch (err) {
    alert("Gagal mencatat transaksi kasir.");
  }
}

function toggleKasirMode() {
  const input = document.getElementById("kasir-id");
  const btn = document.getElementById("btn-toggle-kasir-mode");
  if (input.type === "text") {
    input.type = "number";
    btn.textContent = "Mode: Angka";
  } else {
    input.type = "text";
    btn.textContent = "Mode: Teks";
  }
}

function navigatePage(direction) {
  if (direction === -1 && currentStart >= limit) {
    currentStart -= limit;
    fetchLaporan();
  } else if (direction === 1) {
    currentStart += limit;
    fetchLaporan();
  }
}

// OCR & CAMERA WEBRTC
async function openCameraModal() {
  const modal = document.getElementById("modal-camera");
  modal.classList.remove("hidden");
  const video = document.getElementById("webcam");

  try {
    streamInstance = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "environment" }
    });
    video.srcObject = streamInstance;
  } catch (err) {
    alert("Gagal mengakses kamera.");
    closeCameraModal();
  }
}

function closeCameraModal() {
  if (streamInstance) {
    streamInstance.getTracks().forEach(t => t.stop());
  }
  document.getElementById("modal-camera").classList.add("hidden");
}

async function captureAndOCR() {
  const video = document.getElementById("webcam");
  const canvas = document.getElementById("ocr-canvas");
  const context = canvas.getContext("2d");

  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  context.drawImage(video, 0, 0, canvas.width, canvas.height);

  const base64Image = canvas.toDataURL("image/jpeg");
  closeCameraModal();

  try {
    const res = await fetch(SCRIPT_URL, {
      method: "POST",
      body: JSON.stringify({ action: "ocr", imageBase64: base64Image })
    });
    const data = await res.json();

    if (data.success && data.numbers && data.numbers.length > 0) {
      speakText("Nomor terdeteksi.");
      if (data.numbers.length === 1) {
        document.getElementById("nomor-hp").value = data.numbers[0];
      } else {
        showNumberSelectionModal(data.numbers);
      }
    } else {
      speakText("Gagal mendeteksi nomor.");
      alert("Tidak ada nomor yang terdeteksi dari foto.");
    }
  } catch (err) {
    speakText("Gagal memproses gambar.");
  }
}

function showNumberSelectionModal(numbers) {
  const modal = document.getElementById("modal-select-nomor");
  const list = document.getElementById("list-nomor-select");
  list.innerHTML = "";

  numbers.forEach(num => {
    const btn = document.createElement("button");
    btn.className = "btn-sec";
    btn.textContent = num;
    btn.onclick = () => {
      document.getElementById("nomor-hp").value = num;
      modal.classList.add("hidden");
    };
    list.appendChild(btn);
  });

  modal.classList.remove("hidden");
}

function speakText(text) {
  if ("speechSynthesis" in window) {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "id-ID";
    window.speechSynthesis.speak(utterance);
  }
}
