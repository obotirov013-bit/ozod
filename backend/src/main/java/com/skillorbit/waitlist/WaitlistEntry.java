package com.skillorbit.waitlist;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;
import java.time.Instant;

/**
 * Запись в waitlist. Email хранится в нормализованном виде (trim + нижний регистр)
 * и уникален на уровне БД — это защищает от дублей даже при одновременных запросах.
 */
@Entity
@Table(name = "waitlist_entries",
        uniqueConstraints = @UniqueConstraint(name = "uk_waitlist_email", columnNames = "email"))
public class WaitlistEntry {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, length = 254)
    private String email;

    @Column(nullable = false, length = 40)
    private String source;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    protected WaitlistEntry() {
        // для JPA
    }

    public WaitlistEntry(String email, String source) {
        this.email = email;
        this.source = source;
        this.createdAt = Instant.now();
    }

    public Long getId() {
        return id;
    }

    public String getEmail() {
        return email;
    }

    public String getSource() {
        return source;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }
}
