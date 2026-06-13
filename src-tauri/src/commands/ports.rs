use netstat2::{get_sockets_info, AddressFamilyFlags, ProtocolFlags, ProtocolSocketInfo};
use serde::{Deserialize, Serialize};
use sysinfo::{Pid, System};

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct PortEntry {
    pub port: u16,
    pub protocol: String,
    pub pid: u32,
    #[serde(rename = "processName")]
    pub process_name: String,
    pub state: String,
}

pub fn get_ports_internal() -> Result<Vec<PortEntry>, String> {
    let af_flags = AddressFamilyFlags::IPV4 | AddressFamilyFlags::IPV6;
    let proto_flags = ProtocolFlags::TCP | ProtocolFlags::UDP;

    let sockets = get_sockets_info(af_flags, proto_flags).map_err(|e| e.to_string())?;

    let sys = System::new_all();

    let mut entries: Vec<PortEntry> = sockets
        .into_iter()
        .filter_map(|si| {
            let pid = *si.associated_pids.first()?;
            let (port, protocol, state) = match &si.protocol_socket_info {
                ProtocolSocketInfo::Tcp(tcp) => (
                    tcp.local_port,
                    "TCP".to_string(),
                    format!("{}", tcp.state),
                ),
                ProtocolSocketInfo::Udp(udp) => {
                    (udp.local_port, "UDP".to_string(), "N/A".to_string())
                }
            };

            // skip unbound sockets with port 0
            if port == 0 {
                return None;
            }

            let process_name = sys
                .process(Pid::from_u32(pid))
                .map(|p| p.name().to_string_lossy().into_owned())
                .unwrap_or_else(|| "unknown".to_string());

            Some(PortEntry {
                port,
                protocol,
                pid,
                process_name,
                state,
            })
        })
        .collect();

    // LISTEN first, then by port number
    entries.sort_by(|a, b| {
        let a_listen = a.state == "LISTEN";
        let b_listen = b.state == "LISTEN";
        b_listen.cmp(&a_listen).then(a.port.cmp(&b.port))
    });

    Ok(entries)
}

#[tauri::command]
pub fn list_ports() -> Result<Vec<PortEntry>, String> {
    get_ports_internal()
}

pub fn kill_port_internal(pid: u32) -> Result<(), String> {
    if pid == 0 {
        return Err("Invalid PID".to_string());
    }
    let sys = System::new_all();
    match sys.process(Pid::from_u32(pid)) {
        Some(process) => {
            if process.kill() {
                Ok(())
            } else {
                Err(format!("Failed to kill process {}", pid))
            }
        }
        None => Err(format!("Process {} not found", pid)),
    }
}

#[tauri::command]
pub fn kill_port(pid: u32) -> Result<(), String> {
    kill_port_internal(pid)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_list_ports_returns_ok() {
        let result = get_ports_internal();
        assert!(result.is_ok(), "get_ports_internal failed: {:?}", result.err());
    }

    #[test]
    fn test_list_ports_entries_have_valid_ports() {
        let entries = get_ports_internal().unwrap();
        for entry in &entries {
            assert!(entry.port > 0, "port should be > 0");
            assert!(
                entry.protocol == "TCP" || entry.protocol == "UDP",
                "protocol must be TCP or UDP"
            );
        }
    }

    #[test]
    fn test_kill_nonexistent_pid_returns_err() {
        let result = kill_port_internal(0);
        assert!(result.is_err(), "killing PID 0 should return Err");
    }
}
