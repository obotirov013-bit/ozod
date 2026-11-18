package com.skillorbit.waitlist;

import com.skillorbit.common.RateLimiter;
import com.skillorbit.waitlist.dto.JoinWaitlistRequest;
import com.skillorbit.waitlist.dto.JoinWaitlistResponse;
import com.skillorbit.waitlist.dto.WaitlistCountResponse;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * POST /api/waitlist        — записаться (201 — новая запись, 200 — уже в списке, 400 — неверный email)
 * GET  /api/waitlist/count  — сколько человек в списке
 */
@RestController
@RequestMapping("/api/waitlist")
public class WaitlistController {

    private final WaitlistService service;
    private final RateLimiter rateLimiter;

    public WaitlistController(WaitlistService service, RateLimiter rateLimiter) {
        this.service = service;
        this.rateLimiter = rateLimiter;
    }

    @PostMapping
    public ResponseEntity<JoinWaitlistResponse> join(@Valid @RequestBody JoinWaitlistRequest request,
                                                     HttpServletRequest http) {
        rateLimiter.check("waitlist:" + http.getRemoteAddr());
        JoinWaitlistResponse response = service.join(request.email(), request.source());
        HttpStatus status = response.status() == JoinStatus.REGISTERED ? HttpStatus.CREATED : HttpStatus.OK;
        return ResponseEntity.status(status).body(response);
    }

    @GetMapping("/count")
    public WaitlistCountResponse count() {
        return new WaitlistCountResponse(service.count());
    }
}
