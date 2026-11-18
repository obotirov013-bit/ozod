package com.skillorbit.waitlist;

import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface WaitlistRepository extends JpaRepository<WaitlistEntry, Long> {

    Optional<WaitlistEntry> findByEmail(String email);

    /** Место в очереди: сколько записей появилось не позже этой. */
    long countByIdLessThanEqual(Long id);
}
