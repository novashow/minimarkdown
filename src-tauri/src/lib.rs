use std::{path::PathBuf, sync::Mutex};
use tauri::{Emitter, Manager, State, WebviewUrl, WebviewWindowBuilder};

#[derive(Default)]
struct PendingOpen(Mutex<Vec<String>>);

fn is_supported_document(path: &std::path::Path) -> bool {
  path.extension()
    .and_then(|extension| extension.to_str())
    .map(|extension| matches!(extension.to_ascii_lowercase().as_str(), "md" | "markdown" | "txt"))
    .unwrap_or(false)
}

fn collect_paths<I>(values: I, cwd: Option<&str>) -> Vec<String>
where
  I: IntoIterator<Item = String>,
{
  values
    .into_iter()
    .filter_map(|value| {
      if value.starts_with('-') { return None; }
      let candidate = PathBuf::from(&value);
      let path = if candidate.is_absolute() {
        candidate
      } else if let Some(directory) = cwd {
        PathBuf::from(directory).join(candidate)
      } else {
        candidate
      };
      if path.is_file() && is_supported_document(&path) {
        path.canonicalize().ok().map(|absolute| absolute.to_string_lossy().into_owned())
      } else {
        None
      }
    })
    .collect()
}

fn queue_paths(app: &tauri::AppHandle, paths: Vec<String>) {
  if paths.is_empty() { return; }
  let state = app.state::<PendingOpen>();
  if let Ok(mut pending) = state.0.lock() {
    for path in paths {
      if !pending.contains(&path) { pending.push(path); }
    }
  }
  let _ = app.emit("open-file-pending", ());
  if let Some(window) = app.get_webview_window("main") {
    let _ = window.show();
    let _ = window.set_focus();
  }
}

#[tauri::command]
fn get_pending_open(state: State<'_, PendingOpen>) -> Vec<String> {
  state.0.lock().map(|mut paths| paths.drain(..).collect()).unwrap_or_default()
}

#[tauri::command]
fn quit_app(_app: tauri::AppHandle) {
  std::process::exit(0);
}

#[tauri::command]
fn hide_main_window(app: tauri::AppHandle) -> Result<(), String> {
  let window = app
    .get_webview_window("main")
    .ok_or_else(|| "main window not found".to_string())?;
  window.hide().map_err(|error| error.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  let mut builder = tauri::Builder::default().manage(PendingOpen::default());

  #[cfg(desktop)]
  {
    builder = builder.plugin(tauri_plugin_single_instance::init(|app, args, cwd| {
      queue_paths(app, collect_paths(args, Some(&cwd)));
    }));
  }

  let app = builder
    .plugin(tauri_plugin_dialog::init())
    .plugin(tauri_plugin_fs::init())
    .plugin(tauri_plugin_log::Builder::default().level(log::LevelFilter::Info).build())
    .plugin(tauri_plugin_process::init())
    .plugin(tauri_plugin_updater::Builder::new().build())
    .invoke_handler(tauri::generate_handler![get_pending_open, quit_app, hide_main_window])
    .setup(|app| {
      let window = match app.get_webview_window("main") {
        Some(window) => window,
        None => WebviewWindowBuilder::new(app, "main", WebviewUrl::default())
          .title("")
          .inner_size(1360.0, 920.0)
          .min_inner_size(960.0, 640.0)
          .visible(true)
          .build()?,
      };
      window.show()?;
      window.set_focus()?;
      let initial = collect_paths(std::env::args().skip(1), None);
      queue_paths(app.handle(), initial);
      Ok(())
    })
    .build(tauri::generate_context!())
    .expect("error while building MiniMarkdown");

  app.run(|app_handle, event| match event {
    #[cfg(desktop)]
    tauri::RunEvent::MenuEvent(event) if event.id().as_ref() == "quit-app" => {
      std::process::exit(0);
    }
    tauri::RunEvent::ExitRequested { .. } => {
      std::process::exit(0);
    }
    tauri::RunEvent::Ready => {
      if let Some(window) = app_handle.get_webview_window("main") {
        let _ = window.show();
        let _ = window.set_focus();
      }
    }
    #[cfg(target_os = "macos")]
    tauri::RunEvent::Reopen { .. } => {
      if let Some(window) = app_handle.get_webview_window("main") {
        let _ = window.show();
        let _ = window.set_focus();
      }
    }
    #[cfg(target_os = "macos")]
    tauri::RunEvent::Opened { urls } => {
      let paths = urls
        .into_iter()
        .filter_map(|url| url.to_file_path().ok())
        .filter(|path| path.is_file() && is_supported_document(path))
        .filter_map(|path| path.canonicalize().ok())
        .map(|path| path.to_string_lossy().into_owned())
        .collect();
      queue_paths(app_handle, paths);
    }
    _ => {}
  });
}
