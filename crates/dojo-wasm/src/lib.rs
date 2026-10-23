//! WebAssembly entry points. ABI: `alloc`/`dealloc` manage buffers in linear memory;
//! `call(name_ptr, name_len, args_ptr, args_len)` returns `(result_ptr << 32) | result_len`,
//! a UTF-8 JSON envelope that the caller releases with `dealloc`.
#![cfg_attr(not(test), deny(clippy::unwrap_used, clippy::expect_used, clippy::panic))]
#![cfg_attr(not(test), warn(clippy::indexing_slicing))]

#[cfg(target_arch = "wasm32")]
mod glue {
    use dojo_core::api;

    #[unsafe(no_mangle)]
    pub extern "C" fn alloc(len: u32) -> u32 {
        let boxed = vec![0u8; len as usize].into_boxed_slice();
        Box::into_raw(boxed) as *mut u8 as u32
    }

    /// # Safety
    /// `ptr`/`len` must come from `alloc` or from a `call` result and be released once.
    #[unsafe(no_mangle)]
    pub unsafe extern "C" fn dealloc(ptr: u32, len: u32) {
        drop(unsafe { Box::from_raw(std::ptr::slice_from_raw_parts_mut(ptr as *mut u8, len as usize)) });
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
        let boxed = out.into_bytes().into_boxed_slice();
        let len = boxed.len() as u64;
        let ptr = Box::into_raw(boxed) as *mut u8 as u32;
        ((ptr as u64) << 32) | len
    }
}
