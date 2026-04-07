//! OSC Client — UDP OSC protocol for Behringer X32 / Midas M32 consoles.
//!
//! Allows pushing PEQ bands computed by the auto-EQ module directly to
//! the mixing console, enabling one-click room correction workflows.

use std::net::UdpSocket;
use std::time::Duration;

use rosc::encoder;
use rosc::{OscMessage, OscPacket, OscType};
use serde::{Deserialize, Serialize};

use crate::auto_eq::PeqBand;

// ─── Types ──────────────────────────────────────────────────────────────

/// Configuration for OSC connection.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OscConfig {
    /// Console IP address or hostname
    pub host: String,
    /// OSC port (default: 10023 for X32/M32)
    pub port: u16,
}

/// Current OSC connection status.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OscStatus {
    pub connected: bool,
    pub host: String,
    pub port: u16,
    pub last_error: Option<String>,
}

/// Target channel or bus for EQ push.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OscEqTarget {
    /// "ch" for input channel, "bus" for mix bus
    pub target_type: String,
    /// Channel/bus number (1-based)
    pub number: u32,
}

// ─── OscClient ──────────────────────────────────────────────────────────

/// UDP OSC client for X32/M32 mixing consoles.
pub struct OscClient {
    socket: Option<UdpSocket>,
    host: String,
    port: u16,
    last_error: Option<String>,
}

impl OscClient {
    /// Creates a new disconnected OSC client.
    pub fn new() -> Self {
        Self {
            socket: None,
            host: String::new(),
            port: 10023,
            last_error: None,
        }
    }

    /// Connects to the console at the given address.
    pub fn connect(&mut self, config: OscConfig) -> Result<OscStatus, String> {
        // Close existing connection if any
        self.socket = None;

        let addr = format!("{}:{}", config.host, config.port);
        let socket = UdpSocket::bind("0.0.0.0:0")
            .map_err(|e| format!("Failed to bind UDP socket: {e}"))?;

        socket
            .set_read_timeout(Some(Duration::from_secs(2)))
            .map_err(|e| format!("Failed to set timeout: {e}"))?;

        socket
            .connect(&addr)
            .map_err(|e| format!("Failed to connect to {addr}: {e}"))?;

        // Send /xinfo to verify connectivity
        let msg = OscPacket::Message(OscMessage {
            addr: "/xinfo".into(),
            args: vec![],
        });

        let encoded = encoder::encode(&msg)
            .map_err(|e| format!("OSC encode error: {e}"))?;

        socket
            .send(&encoded)
            .map_err(|e| format!("Failed to send to {addr}: {e}"))?;

        log::info!("OSC: connected to {addr}");

        self.host = config.host;
        self.port = config.port;
        self.socket = Some(socket);
        self.last_error = None;

        Ok(self.status())
    }

    /// Disconnects from the console.
    pub fn disconnect(&mut self) {
        self.socket = None;
        self.last_error = None;
        log::info!("OSC: disconnected");
    }

    /// Returns the current connection status.
    pub fn status(&self) -> OscStatus {
        OscStatus {
            connected: self.socket.is_some(),
            host: self.host.clone(),
            port: self.port,
            last_error: self.last_error.clone(),
        }
    }

    /// Pushes PEQ bands to a channel/bus on the X32/M32.
    ///
    /// X32 OSC paths:
    ///   Channel EQ: /ch/XX/eq/N/f, /ch/XX/eq/N/g, /ch/XX/eq/N/q
    ///   Bus EQ:     /bus/XX/eq/N/f, /bus/XX/eq/N/g, /bus/XX/eq/N/q
    ///
    /// Where XX is the zero-padded channel number and N is the band index (1-6).
    ///
    /// Returns the number of bands successfully pushed.
    pub fn push_eq(&self, target: &OscEqTarget, bands: &[PeqBand]) -> Result<usize, String> {
        let socket = self.socket.as_ref().ok_or("Not connected")?;

        // X32 has 6 PEQ bands per channel
        let max_bands = 6.min(bands.len());
        let prefix = match target.target_type.as_str() {
            "ch" => format!("/ch/{:02}", target.number),
            "bus" => format!("/bus/{:02}", target.number),
            other => return Err(format!("Unknown target type: {other}")),
        };

        let mut sent = 0;

        for (i, band) in bands.iter().take(max_bands).enumerate() {
            let band_num = i + 1;

            // Enable EQ band type (parametric = 3 on X32)
            self.send_osc(
                socket,
                &format!("{prefix}/eq/{band_num}/type"),
                vec![OscType::Int(3)],
            )?;

            // Frequency — X32 expects a float 0.0–1.0 representing the log scale
            let freq_norm = freq_to_x32_normalized(band.frequency);
            self.send_osc(
                socket,
                &format!("{prefix}/eq/{band_num}/f"),
                vec![OscType::Float(freq_norm)],
            )?;

            // Gain — X32 expects a float 0.0–1.0 where 0.5 = 0dB
            let gain_norm = gain_to_x32_normalized(band.gain_db);
            self.send_osc(
                socket,
                &format!("{prefix}/eq/{band_num}/g"),
                vec![OscType::Float(gain_norm)],
            )?;

            // Q factor — X32 expects a float 0.0–1.0 representing log Q
            let q_norm = q_to_x32_normalized(band.q);
            self.send_osc(
                socket,
                &format!("{prefix}/eq/{band_num}/q"),
                vec![OscType::Float(q_norm)],
            )?;

            sent += 1;
        }

        log::info!("OSC: pushed {sent} EQ bands to {prefix}");
        Ok(sent)
    }

    /// Sends a keepalive (/xremote) to keep the connection alive.
    #[allow(dead_code)]
    pub fn send_keepalive(&self) {
        if let Some(socket) = &self.socket {
            let _ = self.send_osc(socket, "/xremote", vec![]);
        }
    }

    // ─── Internal ───────────────────────────────────────────────────────

    fn send_osc(&self, socket: &UdpSocket, addr: &str, args: Vec<OscType>) -> Result<(), String> {
        let msg = OscPacket::Message(OscMessage {
            addr: addr.into(),
            args,
        });

        let encoded = encoder::encode(&msg)
            .map_err(|e| format!("OSC encode error: {e}"))?;

        socket
            .send(&encoded)
            .map_err(|e| format!("OSC send error: {e}"))?;

        Ok(())
    }
}

impl Default for OscClient {
    fn default() -> Self {
        Self::new()
    }
}

// ─── X32 parameter normalization ────────────────────────────────────────

/// Converts a frequency (20–20000 Hz) to the X32 normalized float (0.0–1.0).
///
/// The X32 uses a logarithmic mapping: n = log2(f/20) / log2(1000).
fn freq_to_x32_normalized(freq_hz: f64) -> f32 {
    let f = freq_hz.clamp(20.0, 20000.0);
    let norm = (f / 20.0).log2() / (20000.0 / 20.0_f64).log2();
    norm.clamp(0.0, 1.0) as f32
}

/// Converts gain in dB (±15 dB range) to X32 normalized float (0.0–1.0).
///
/// X32 maps: 0.0 = -15dB, 0.5 = 0dB, 1.0 = +15dB.
fn gain_to_x32_normalized(gain_db: f64) -> f32 {
    let g = gain_db.clamp(-15.0, 15.0);
    let norm = (g + 15.0) / 30.0;
    norm.clamp(0.0, 1.0) as f32
}

/// Converts Q factor (0.3–10) to X32 normalized float (0.0–1.0).
fn q_to_x32_normalized(q: f64) -> f32 {
    let q_clamped = q.clamp(0.3, 10.0);
    let norm = (q_clamped / 0.3).log2() / (10.0 / 0.3_f64).log2();
    norm.clamp(0.0, 1.0) as f32
}
