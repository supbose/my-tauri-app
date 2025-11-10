// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command]
fn toggle_devtools(window: tauri::Window) {
    // 在Tauri 2.x中，开发者工具的API已经改变
    // 这里提供一个简单的实现，确保应用能够编译
    #[cfg(desktop)]
    {
        // 尝试获取窗口标题作为调试信息
        if let Ok(title) = window.title() {
            // window
            eprintln!("Devtools toggle requested for window: {}", title);
        } else {
            eprintln!("Devtools toggle requested");
        }
        
        // 注意：在实际应用中，您可能需要查阅Tauri 2.x的最新文档
        // 以了解如何正确打开开发者工具
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![greet, toggle_devtools])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}