import { Notyf } from "notyf";
import Chart from "chart.js/auto";
import zoomPlugin from "chartjs-plugin-zoom";
Chart.register(zoomPlugin);

const notyf = new Notyf({ duration: 5000, dismissible: true });

if (!("serial" in navigator)) {
    alert("Your browser does not support serial!");
    location.reload();
}

function e(id: string) {
    return document.getElementById(id);
}
function oc(id: string, callback: (e: HTMLElement) => () => void) {
    document.getElementById(id).addEventListener("click", callback(document.getElementById(id)));
}
function oe(id: string, callback: (e: HTMLElement) => () => void) {
    const c = callback(document.getElementById(id));
    document.getElementById(id).addEventListener("keydown", (ev) => {
        if (ev.key === "Enter") {
            c();
        }
    });
}

type Dataset = { x: number; y: number }[];
const data: { index: number; raw: Dataset; od: Dataset; gain: Dataset; intTime: Dataset; wavelength: Dataset; note: { x: number; y: string }[] } = {
    index: 0,
    raw: [],
    od: [],
    intTime: [],
    wavelength: [],
    gain: [],
    note: [],
};

let connectedPort: SerialPort = null;
let currentReader: ReadableStreamDefaultReader = null;
let currentWriter: WritableStreamDefaultWriter = null;
const btnConnect = document.getElementById("btnSelect");

let thisGain: number = 0;
let thisWavelength: number = 0;
let thisIntTime: number = 0;
let note: string = "";

function setGain(gain: string) {
    thisGain = Number.parseInt(gain);
    document.getElementById("ddGainValue").innerText = gain + "X";
    const mapping: { [i: string]: string } = { 1: "0", 4: "1", 16: "2", 64: "3", 128: "4" };
    if (currentWriter) currentWriter.write(mapping[gain]);
}

function setIntegrationTime(numTicks: number) {
    thisIntTime = ((numTicks * 25 + 5) * 2.78) >> 0;
    document.getElementById("ddIntTimeValue").innerText = (((numTicks * 25 + 5) * 2.78) >> 0) + "ms";
    if (currentWriter) currentWriter.write(String.fromCharCode("a".charCodeAt(0) + numTicks));
}

function setWavelength(ir: boolean) {
    thisWavelength = ir ? 850 : 600;
    if (currentWriter) currentWriter.write(ir ? "y" : "x");
    if (ir) {
        e("sliderFreq").style.transform = `translate(${e("sliderFreq850").getBoundingClientRect().x - e("sliderFreq850").parentElement.getBoundingClientRect().x - 12}px,0)`;
    } else {
        e("sliderFreq").style.transform = "";
    }
}

e("sliderFreqBase").addEventListener("click", () => {
    if (e("sliderFreq").style.transform === "") {
        setWavelength(true);
    } else {
        setWavelength(false);
    }
});

document.getElementById("btnZero").addEventListener("click", async () => {
    await currentWriter.write("z");
});

document.getElementById("btnExport").addEventListener("click", async () => {
    try {
        try {
            var newHandle = await window.showSaveFilePicker({
                suggestedName: "data.csv",
                types: [
                    {
                        description: "CSV (Comma delimited)",
                        accept: { "text/csv": [".csv"] },
                    },
                ],
            });
        } catch (e) {
            if (e.message.includes("The user aborted a request")) return;
            throw e;
        }

        const writableStream = await newHandle.createWritable();
        await writableStream.write("Raw,OD x1000,Gain,Integration time (ms),Wavelength (nm),Note\n");

        window.onbeforeunload = () => {
            writableStream.close();
        };

        let streamString = "";
        for (let i = 0; i < data.raw.length; i++) {
            streamString += data.raw[i].y + "," + data.od[i].y + "," + data.gain[i].y + "," + data.intTime[i].y + "," + data.wavelength[i].y + "," + data.note[i].y + "\n";
        }
        await writableStream.write(streamString);

        await writableStream.close();
        notyf.success("CSV exported successfully!");
    } catch (e) {
        notyf.error("Failed to export CSV!");
    } finally {
        window.onbeforeunload = null;
    }
});

document.querySelector("#ddGain .btn").addEventListener("click", () => {
    const dd = <HTMLElement>document.querySelector("#ddGain .dropdown");
    dd.style.display = dd.style.display == "" ? "none" : "";
});
document.querySelectorAll("#ddGain .dropdownEntry").forEach((e) => {
    e.addEventListener("click", () => {
        (<HTMLElement>document.querySelector("#ddGain .dropdown")).style.display = "none";
        setGain(e.getAttribute("gain"));
    });
});

// Create integration time dropdown:
for (let i = 0; i <= 10; i++) {
    const entry = document.createElement("div");
    entry.classList.add("dropdownEntry");
    entry.setAttribute("time", String(i));
    entry.innerText = (((i * 25 + 5) * 2.78) >> 0) + "ms";
    document.querySelector("#ddIntTime .dropdown").append(entry);
}
document.querySelector("#ddIntTime .btn").addEventListener("click", () => {
    const dd: HTMLElement = document.querySelector("#ddIntTime .dropdown");
    dd.style.display = dd.style.display == "" ? "none" : "";
});
document.querySelectorAll("#ddIntTime .dropdownEntry").forEach((e) => {
    e.addEventListener("click", () => {
        (<HTMLElement>document.querySelector("#ddIntTime .dropdown")).style.display = "none";
        setIntegrationTime(Number.parseInt(e.getAttribute("time")));
    });
});

let integrationIteratorTimeout: number = null;
oc("btnScanIntegrationTimes", (e) => () => {
    if (e.classList.toggle("active")) {
        let i = 0;
        setIntegrationTime(0);
        setTimeout(() => {
            const t = () =>
                setTimeout(() => {
                    setIntegrationTime(++i);
                    if (i >= 11) {
                        e.classList.remove("active");
                    } else {
                        integrationIteratorTimeout = t();
                    }
                }, (5 * ((i * 25 + 5) * 2.78)) >> 0);
            integrationIteratorTimeout = t();
        }, 1000);
    } else {
        clearTimeout(integrationIteratorTimeout);
    }
});

oe("noteInput", (e: HTMLInputElement) => () => {
    document.getElementById("noteCheck").style.fill = "#32de84";
    note = e.value;
});
document.getElementById("noteInput").addEventListener("input", () => {
    document.getElementById("noteCheck").style.fill = "none";
});

const chart = new Chart(<HTMLCanvasElement>document.getElementById("myChart"), {
    type: "line",
    data: {
        datasets: [
            {
                borderWidth: 1,
                pointRadius: 0,
                data: data.raw,
                label: "Raw",
            },
            {
                borderWidth: 1,
                pointRadius: 0,
                data: data.od,
                label: "OD x1000",
            },
        ],
    },
    options: {
        animation: false,
        interaction: {
            intersect: false,
        },
        parsing: false,
        responsive: true,
        maintainAspectRatio: false,
        scales: {
            x: {
                type: "linear",
                ticks: {
                    minRotation: 0,
                    maxRotation: 0,
                    precision: 0,
                    includeBounds: false,
                },
            },
            y: {
                ticks: {
                    precision: 0,
                    minRotation: 0,
                    maxRotation: 0,
                    includeBounds: false,
                },
            },
        },
        plugins: {
            decimation: {
                enabled: true,
                algorithm: "min-max",
                // samples: 50,
            },
            zoom: {
                zoom: {
                    wheel: {
                        enabled: true,
                    },
                    pinch: {
                        enabled: true,
                    },
                    mode: "xy",
                },
                pan: {
                    enabled: true,
                    onPanStart: ({ chart }) => {
                        chart.tooltip.setActiveElements([], { x: 0, y: 0 });
                        return true;
                    },
                },
            },
        },
        spanGaps: true,
    },
});

document.getElementById("btnClear").addEventListener("click", () => {
    data.raw.length = 0;
    data.od.length = 0;
    data.gain.length = 0;
    data.intTime.length = 0;
    data.wavelength.length = 0;
    data.index = 0;
    chart.update();
});

document.body.onmousemove = (e) => {
    const zoomConfig = (<any>chart.config.options.plugins).zoom;

    if (e.clientY > window.innerHeight - 40) {
        document.body.style.cursor = "ew-resize";
        zoomConfig.zoom.mode = "x";
    } else if (e.clientX < 40) {
        document.body.style.cursor = "ns-resize";
        zoomConfig.zoom.mode = "y";
    } else {
        document.body.style.cursor = "";
        zoomConfig.zoom.mode = "xy";
    }
};

async function disconnectPort() {
    if (!connectedPort) return;
    if (currentReader) {
        await currentReader.cancel();
        currentReader = null;
    }
}

async function selectPort() {
    const port = await navigator.serial.requestPort();
    if (port) {
        connectToPort(port);
    }
}

async function connectToPort(port: SerialPort) {
    await port.open({ baudRate: 921000 });
    connectedPort = port;
    await (<any>port).setSignals({ dataTerminalReady: true, requestToSend: false });

    btnConnect.innerText = "Disconnect";
    btnConnect.onclick = () => disconnectPort();
    btnConnect.classList.add("active");

    let readableStreamClosed;
    let writableStreamClosed;

    const textEncoder = new TextEncoderStream();
    writableStreamClosed = textEncoder.readable.pipeTo(connectedPort.writable);
    currentWriter = textEncoder.writable.getWriter();

    let reading = true;

    while (port.readable && reading) {
        const textDecoder = new TextDecoderStream();
        readableStreamClosed = port.readable.pipeTo(textDecoder.writable);
        const reader = textDecoder.readable.getReader();
        currentReader = reader;

        setGain("128");
        setIntegrationTime(1);
        setWavelength(false);

        let state = 0;
        let currentNumString = "";

        try {
            while (true) {
                const { value, done } = await reader.read();
                if (done) {
                    reading = false;
                    break;
                }
                if (value) {
                    for (const c of value) {
                        switch (state) {
                            case 0:
                                if (c === "$") {
                                    state = 1;
                                }
                                break;
                            case 1:
                                if (c !== " ") {
                                    currentNumString += c;
                                } else {
                                    data.raw.push({ x: data.index, y: Number.parseFloat(currentNumString) });
                                    currentNumString = "";
                                    state = 2;
                                }
                                break;
                            case 2:
                                if (c !== ";") {
                                    currentNumString += c;
                                } else {
                                    data.od.push({ x: data.index, y: Number.parseFloat(currentNumString) });
                                    data.gain.push({ x: data.index, y: thisGain });
                                    data.intTime.push({ x: data.index, y: thisIntTime });
                                    data.wavelength.push({ x: data.index, y: thisWavelength });
                                    data.note.push({ x: data.index, y: note });
                                    currentNumString = "";
                                    state = 0;
                                    data.index++;
                                    chart.update();
                                }
                                break;
                            default:
                                throw Error("Invalid state: " + state);
                        }
                    }
                }
            }
        } catch (error) {
            console.error(error);
        }
    }

    try {
        await currentReader.cancel();
        currentReader.releaseLock();
        await readableStreamClosed.catch(() => {});

        await currentWriter.close();
        currentWriter.releaseLock();
        await writableStreamClosed;

        await port.close();
    } finally {
        btnConnect.innerText = "Select device";
        btnConnect.onclick = selectPort;
        btnConnect.classList.remove("active");
    }
}

navigator.serial.getPorts().then(async (ports) => {
    if (ports.length > 0) {
        connectToPort(ports[0]);
    }
});

btnConnect.onclick = selectPort;
