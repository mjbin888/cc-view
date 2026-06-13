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
    #[serde(rename = "exePath")]
    pub exe_path: String,
    #[serde(rename = "isUserProcess")]
    pub is_user_process: bool,
    pub state: String,
}

pub fn get_ports_internal() -> Result<Vec<PortEntry>, String> {
    let af_flags = AddressFamilyFlags::IPV4 | AddressFamilyFlags::IPV6;
    let proto_flags = ProtocolFlags::TCP | ProtocolFlags::UDP;

    let sockets = get_sockets_info(af_flags, proto_flags).map_err(|e| e.to_string())?;

    let sys = System::new_all();

    // Current user's uid — basis for is_user_process comparison.
    let current_uid = sysinfo::get_current_pid()
        .ok()
        .and_then(|pid| sys.process(pid))
        .and_then(|p| p.user_id())
        .cloned();

    let mut seen: std::collections::HashSet<(u16, u32, String)> = std::collections::HashSet::new();
    let mut entries: Vec<PortEntry> = Vec::new();

    for si in sockets {
        let pid = match si.associated_pids.first() {
            Some(p) => *p,
            None => continue,
        };

        let (port, protocol, state) = match &si.protocol_socket_info {
            ProtocolSocketInfo::Tcp(tcp) => {
                (tcp.local_port, "TCP".to_string(), format!("{}", tcp.state))
            }
            ProtocolSocketInfo::Udp(udp) => {
                (udp.local_port, "UDP".to_string(), "N/A".to_string())
            }
        };

        // skip unbound sockets with port 0
        if port == 0 {
            continue;
        }

        // dedup IPv4/IPv6 collapse on identical (port, pid, protocol)
        let key = (port, pid, protocol.clone());
        if !seen.insert(key) {
            continue;
        }

        let process = sys.process(Pid::from_u32(pid));

        let process_name = process
            .map(|p| p.name().to_string_lossy().into_owned())
            .unwrap_or_else(|| "unknown".to_string());

        let exe_path = process
            .and_then(|p| p.exe())
            .map(|path| path.to_string_lossy().into_owned())
            .unwrap_or_default();

        let is_user_process = match (&current_uid, process.and_then(|p| p.user_id())) {
            (Some(cur), Some(uid)) => cur == uid,
            _ => false,
        };

        entries.push(PortEntry {
            port,
            protocol,
            pid,
            process_name,
            exe_path,
            is_user_process,
            state,
        });
    }

    // user processes first, then LISTEN first, then by port number
    entries.sort_by(|a, b| {
        b.is_user_process
            .cmp(&a.is_user_process)
            .then_with(|| {
                b.state
                    .starts_with("LISTEN")
                    .cmp(&a.state.starts_with("LISTEN"))
            })
            .then_with(|| a.port.cmp(&b.port))
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

    #[test]
    fn test_list_ports_no_duplicate_keys() {
        let entries = get_ports_internal().unwrap();
        let mut seen = std::collections::HashSet::new();
        for e in &entries {
            let key = (e.port, e.pid, e.protocol.clone());
            assert!(
                seen.insert(key),
                "duplicate (port,pid,protocol) found: {} {} {}",
                e.port, e.pid, e.protocol
            );
        }
    }

    #[test]
    fn test_entries_carry_new_fields() {
        let entries = get_ports_internal().unwrap();
        for e in &entries {
            let _ = &e.exe_path;
            let _ = e.is_user_process;
        }
    }

    #[test]
    fn test_user_processes_sorted_first() {
        let entries = get_ports_internal().unwrap();
        let mut seen_system = false;
        for e in &entries {
            if !e.is_user_process {
                seen_system = true;
            } else {
                assert!(
                    !seen_system,
                    "user process appeared after a system process — sort is wrong"
                );
            }
        }
    }
}
