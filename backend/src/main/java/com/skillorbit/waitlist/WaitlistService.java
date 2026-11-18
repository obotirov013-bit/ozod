package com.skillorbit.waitlist;

import com.skillorbit.waitlist.dto.JoinWaitlistResponse;
import java.util.Optional;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;

@Service
public class WaitlistService {

    private static final Logger log = LoggerFactory.getLogger(WaitlistService.class);
    private static final String DEFAULT_SOURCE = "landing";

    private final WaitlistRepository repository;

    public WaitlistService(WaitlistRepository repository) {
        this.repository = repository;
    }

    /**
     * Записывает email в waitlist. Повторная запись возвращает ALREADY_REGISTERED.
     *
     * <p>Метод намеренно без общей транзакции: каждый вызов репозитория идёт в своей транзакции,
     * поэтому после конфликта уникального ключа (два одновременных запроса с одним адресом)
     * запись можно спокойно перечитать.
     */
    public JoinWaitlistResponse join(String rawEmail, String rawSource) {
        String email = EmailRules.normalize(rawEmail);
        String source = rawSource == null || rawSource.isBlank() ? DEFAULT_SOURCE : rawSource.trim();

        Optional<WaitlistEntry> existing = repository.findByEmail(email);
        if (existing.isPresent()) {
            return toResponse(existing.get(), JoinStatus.ALREADY_REGISTERED);
        }

        try {
            WaitlistEntry saved = repository.saveAndFlush(new WaitlistEntry(email, source));
            log.info("Waitlist: {} joined from '{}'", EmailRules.mask(email), source);
            return toResponse(saved, JoinStatus.REGISTERED);
        } catch (DataIntegrityViolationException race) {
            return repository.findByEmail(email)
                    .map(entry -> toResponse(entry, JoinStatus.ALREADY_REGISTERED))
                    .orElseThrow(() -> race);
        }
    }

    public long count() {
        return repository.count();
    }

    private JoinWaitlistResponse toResponse(WaitlistEntry entry, JoinStatus status) {
        long position = repository.countByIdLessThanEqual(entry.getId());
        String message = status == JoinStatus.REGISTERED
                ? "You're on the SkillOrbit waitlist."
                : "This email is already on the SkillOrbit waitlist.";
        return new JoinWaitlistResponse(status, entry.getEmail(), position, message);
    }
}
