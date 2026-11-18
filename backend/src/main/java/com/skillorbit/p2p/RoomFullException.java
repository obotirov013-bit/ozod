package com.skillorbit.p2p;

/** В комнате уже максимальное число участников (mesh-сеть плохо растёт). */
public class RoomFullException extends RuntimeException {

    private final int limit;

    public RoomFullException(String room, int limit) {
        super("Room '" + room + "' is full");
        this.limit = limit;
    }

    public int getLimit() {
        return limit;
    }
}
