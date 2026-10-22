//! WebAssembly entry points. ABI: `alloc`/`dealloc` manage buffers in linear memory;
//! `call(name_ptr, name_len, args_ptr, args_len)` returns `(result_ptr << 32) | result_len`,
//! a UTF-8 JSON envelope that the caller releases with `dealloc`.

#[cfg(target_arch = "wasm32")]
mod glue {
    use dojo_core::api;

    #[unsafe(no_mangle)]
    pub extern "C" fn alloc(len: u32) -> u32 {
        let mut buf = Vec::<u8>::with_capacity(len as usize);
        let ptr = buf.as_mut_ptr();
        std::mem::forget(buf);
        ptr as u32
    }

    /// # Safety
    /// `ptr`/`len` must come from `alloc` or from a `call` result and be released once.
    #[unsafe(no_mangle)]
    pub unsafe extern "C" fn dealloc(ptr: u32, len: u32) {
        drop(unsafe { Vec::from_raw_parts(ptr as *mut u8, 0, len as usize) });
    }

    fn read(ptr: u32, len: u32) -> Option<&'static str> {
        let bytes = unsafe { std::slice::from_raw_parts(ptr as *const u8, len as usize) };
        std::str::from_utf8(bytes).ok()
    }

    /// # Safety
    /// Both buffers must be live allocations of the stated length.
    #[unsafe(no_mangle)]
    pub unsafe extern "C" fn call(name_ptr: u32, name_len: u32, args_ptr: u32, args_len: u32) -> u64 {
        let out = match (read(name_ptr, name_len), read(args_ptr, args_len)) {
            (Some(name), Some(args)) => api::call(name, args),
            _ => r#"{"ok":false,"error":{"code":"bad_utf8","message":"input is not valid UTF-8"}}"#.to_string(),
        };
        let mut bytes = out.into_bytes();
        bytes.shrink_to_fit();
        let (ptr, len) = (bytes.as_mut_ptr() as u32, bytes.len() as u64);
        std::mem::forget(bytes);
        ((ptr as u64) << 32) | len
    }
}
