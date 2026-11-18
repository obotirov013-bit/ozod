package com.skillorbit.skill;

/** Навыки-«планеты» SkillOrbit. id совпадает с id раздела и комнаты на фронтенде. */
public enum Skill {
    IELTS("ielts", "IELTS"),
    SAT("sat", "SAT"),
    CSCA("csca", "CSCA"),
    PROGRAMMING("programming", "Programming");

    private final String id;
    private final String title;

    Skill(String id, String title) {
        this.id = id;
        this.title = title;
    }

    public String id() {
        return id;
    }

    public String title() {
        return title;
    }
}
