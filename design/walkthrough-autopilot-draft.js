// Walkthrough autopilot DRAFT (2026-08-31) - parked for the REAL solution, not the dummy.
// Spine verified (whisper->flight->arc->room->typing->end); the delta/confirm/execute beats
// need element-readiness waits instead of fixed timeouts. Port note: drive off await-selector,
// not the dummy's hardcoded pacing.

  /* ---------- THE WALKTHROUGH: the cockpit demos itself, Esc hands it back ---------- */
  var touring = false;
  function tourStop(){
    if(!touring) return;
    touring = false;
    document.body.classList.remove("touring");
  }
  function tstep(fn, ms){ /* schedule one beat; dies silently if the human took over */
    return new Promise(function(res){
      setTimeout(function(){
        if(!touring){ res(false); return; }
        try{ fn(); }catch(e){}
        res(true);
      }, ms);
    });
  }
  function tourType(text, done){ /* a hand at the keyboard, not a paste */
    var inp = $("#wkInput"), i = 0;
    (function tick(){
      if(!touring){ done(); return; }
      if(i >= text.length){ setTimeout(done, 350); return; }
      inp.value = text.slice(0, ++i);
      setTimeout(tick, 34 + Math.random() * 40);
    })();
  }
  function startTour(){
    if(touring) return;
    touring = true;
    document.body.classList.add("touring");
    /* reset to the landing, then play the story on the known pacing */
    show("home");
    var seq = Promise.resolve(true);
    function beat(ms, fn){ seq = seq.then(function(ok){ return ok === false ? false : tstep(fn, ms); }); }
    beat(1200, function(){ $("#whisper").classList.add("show"); $("#fab").classList.add("breathe"); });
    beat(2400, function(){ hideWhisper(); $("#fab").classList.remove("breathe");
      document.querySelector('button[data-open="hartwell"]').click(); });
    beat(1600, function(){ $("#fab").click(); });
    beat(1100, function(){ document.querySelector('.arcbtn[data-act="modify"]').click(); });
    beat(2900, function(){ var b = $("#pkgBooked"); if(b) b.click(); });
    beat(3600, function(){ var f = document.querySelector(".wk-fac"); if(f) f.click(); });
    seq = seq.then(function(ok){
      if(ok === false || !touring) return false;
      return new Promise(function(res){
        setTimeout(function(){
          if(!touring){ res(false); return; }
          tourType("Increase the revolver to $19.0M, keep pricing", function(){
            if(touring) $("#wkSend").click();
            res(touring);
          });
        }, 3000);
      });
    });
    beat(3600, function(){
      var c = Array.prototype.slice.call(document.querySelectorAll(".wk-step:not(.gone) button"))
        .filter(function(b){ return b.textContent.trim() === "Confirm"; })[0];
      if(c) c.click();
    });
    beat(2400, function(){ var pb = document.querySelector(".wk-propose"); if(pb) pb.click(); });
    beat(1500, function(){
      var ex = Array.prototype.slice.call(document.querySelectorAll("button"))
        .filter(function(b){ return /execute write/i.test(b.textContent) && b.offsetParent; })[0];
      if(ex) ex.click();
    });
    beat(8200, function(){ $("#wkClose").click(); }); /* the glass lifts; the wash settles on what changed */
    beat(1400, function(){ toast("That was the walkthrough. It is all real UI, take the wheel."); });
    seq.then(function(){ tourStop(); });
  }
  addEventListener("keydown", function(e){ if(e.key === "Escape") tourStop(); });

