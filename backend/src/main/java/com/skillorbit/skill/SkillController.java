package com.skillorbit.skill;

import com.skillorbit.p2p.PeerRegistry;
import java.util.Arrays;
import java.util.List;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** GET /api/skills — список планет и сколько учеников сейчас в их P2P-комнатах. */
@RestController
@RequestMapping("/api/skills")
public class SkillController {

    private final PeerRegistry registry;

    public SkillController(PeerRegistry registry) {
        this.registry = registry;
    }

    @GetMapping
    public List<SkillView> list() {
        return Arrays.stream(Skill.values())
                .map(skill -> new SkillView(skill.id(), skill.title(), registry.onlineInSkill(skill.id())))
                .toList();
    }

    public record SkillView(String id, String title, int peersOnline) {
    }
}
