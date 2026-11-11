#!/usr/bin/env python3
"""Mouse clicker using ctypes + CoreGraphics (no PyObjC needed)."""
import ctypes, ctypes.util, sys, time

class CGPoint(ctypes.Structure):
    _fields_ = [("x", ctypes.c_double), ("y", ctypes.c_double)]

cg = ctypes.CDLL(ctypes.util.find_library("CoreGraphics"))

cg.CGEventCreateMouseEvent.restype = ctypes.c_void_p
cg.CGEventCreateMouseEvent.argtypes = [ctypes.c_void_p, ctypes.c_uint32, CGPoint, ctypes.c_uint32]
cg.CGEventPost.argtypes = [ctypes.c_uint32, ctypes.c_void_p]

kCGEventLeftMouseDown = 1
kCGEventLeftMouseUp = 2
kCGEventMouseMoved = 5
kCGEventLeftDragged = 6
kCGMouseButtonLeft = 0
kCGHIDEventTap = 0


def move(x, y):
    e = cg.CGEventCreateMouseEvent(None, kCGEventMouseMoved, CGPoint(x, y), 0)
    cg.CGEventPost(kCGHIDEventTap, e)
    time.sleep(0.02)


def click(x, y, delay=0.08):
    move(x, y)
    time.sleep(0.05)
    e = cg.CGEventCreateMouseEvent(None, kCGEventLeftMouseDown, CGPoint(x, y), kCGMouseButtonLeft)
    cg.CGEventPost(kCGHIDEventTap, e)
    time.sleep(delay)
    e = cg.CGEventCreateMouseEvent(None, kCGEventLeftMouseUp, CGPoint(x, y), kCGMouseButtonLeft)
    cg.CGEventPost(kCGHIDEventTap, e)
    time.sleep(0.15)


def drag(x1, y1, x2, y2, steps=10):
    move(x1, y1)
    time.sleep(0.05)
    e = cg.CGEventCreateMouseEvent(None, kCGEventLeftMouseDown, CGPoint(x1, y1), kCGMouseButtonLeft)
    cg.CGEventPost(kCGHIDEventTap, e)
    time.sleep(0.05)
    for i in range(1, steps + 1):
        x = x1 + (x2 - x1) * i / steps
        y = y1 + (y2 - y1) * i / steps
        e = cg.CGEventCreateMouseEvent(None, kCGEventLeftDragged, CGPoint(x, y), kCGMouseButtonLeft)
        cg.CGEventPost(kCGHIDEventTap, e)
        time.sleep(0.02)
    e = cg.CGEventCreateMouseEvent(None, kCGEventLeftMouseUp, CGPoint(x2, y2), kCGMouseButtonLeft)
    cg.CGEventPost(kCGHIDEventTap, e)
    time.sleep(0.15)


if __name__ == "__main__":
    if len(sys.argv) >= 3:
        x, y = float(sys.argv[1]), float(sys.argv[2])
        click(x, y)
        print(f"clicked {x},{y}")
