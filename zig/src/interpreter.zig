const std = @import("std");

// https://github.com/MichalGrzymek/myblog/blob/main/public/zigwasm/strings/strings.zig

export fn doubleString(s: [*]u8, length: usize, capacity: usize) i32 {
    if (capacity < length * 2) {
        return -1;
    }
    const left = s[0..length];
    const right = s[length .. length * 2];
    @memcpy(right, left);
    return @as(i32, @intCast(length)) * 2;
}

// const walloc = std.heap.wasm_allocator;
const walloc = std.heap.wasm_allocator;

extern fn fill([*]u8, usize) usize;

const Word = struct {
    string: []const u8,
};
const List = struct {
    len: i32,
    items: ?[] const Form,
};
const FormTag = enum {
    word,
    list,
};
const Form = union(FormTag) {
    word: Word,
    list: List,
};

fn isWordChar(char: u8) bool {
    return char > 'a' and char < 'z' or char > '0' and char < '9';
}

const ParseError = error{
    IllegalCharacter,
    UnexpectedEndOfInput,
    UnexpectedToken,
};

fn parseOne() !Form {
    const buffer = try walloc.alloc(u8, 1024);
    const filled = fill(@ptrCast(buffer), 1024);
    var i: u32 = 0;
    while (i < filled) {
        const char = buffer[i];
        if (char == ' ')
            continue;
        if (char == ']')
            return ParseError.UnexpectedToken;
        if (isWordChar(char)) {
            const start = i;
            i += 1;
            while (isWordChar(buffer[i])) {
                if (i == filled) {
                    break;
                }
                i += 1;
            }
            // parse word
            // const word = Word{ .id = @intCast(i) };
            return Form{ .word = Word{ .string = buffer[start..i] } };
        } else if (char == '[') {
            // parse list
            const list = List{ .len = 0, .items = null };
            return Form{ .list = list };
        }

    }
    return ParseError.UnexpectedEndOfInput;
}
const Tuple = std.meta.Tuple;
fn eval(form: Form) Tuple(&.{i32, i32})  {
    switch (form) {
        .word => |w| {
            const integer = std.fmt.parseInt(i32, w.string, 10) catch {
                return -1;
            };
            return integer;
        },
        .list => {
            return 2;
        },
    }
}

export fn parseEvalOne() Tuple(&.{i32, i32})  {
    const form = parseOne() catch {
        return .{-1, -1};
    };
    return eval(form);
}
