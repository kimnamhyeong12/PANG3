package com.fieldwork.service;
import com.fieldwork.entity.*;
import com.fieldwork.repository.*;
import com.fieldwork.dto.PublicDataItem;
import java.time.*;
import java.util.*;
import org.springframework.data.domain.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.http.HttpStatus;
@Service @Transactional(readOnly=true)
public class FacilityRegistryService {
    private final FacilityApplicationRepository applications;private final FacilityCategoryRepository categories;private final RegisteredFacilityRepository facilities;private final UserRepository users;private final FacilityEvidenceService evidence;
    public FacilityRegistryService(FacilityApplicationRepository a,FacilityCategoryRepository c,RegisteredFacilityRepository f,UserRepository u,FacilityEvidenceService e){applications=a;categories=c;facilities=f;users=u;evidence=e;}
    public record Input(String name,String kind,String address,String detailLocation,String confirmedDate,String description,String requestKey,Boolean consent){}
    public record Review(String status,String note,Long version,String categoryName,String name,String address,Double lat,Double lng,String sido,String sigungu,String adminDong){}
    public record Item(Long id,String name,String kind,String status,Instant createdAt){}
    public record Detail(Long id,String name,String kind,String address,String detailLocation,LocalDate confirmedDate,String description,double photoLat,double photoLng,String status,String reviewNote,Instant reviewedAt,long version,boolean hasScreenshot){}
    public record Rows(List<Item> items,int page,boolean hasMore){}
    public record Category(String key,String label,String shortLabel,String icon){}
    private User user(Long id){return users.findById(id).filter(u->!"DELETED".equals(u.getRole())).orElseThrow(()->err(401,"다시 로그인해 주세요."));}
    public void reviewer(Long id){User u=user(id);if(!List.of("ADMIN","FACILITY_REVIEWER").contains(u.getRole()))throw err(403,"공공시설물 검토 권한이 필요합니다.");}
    private static String text(String value,int max,String label){if(value==null||value.isBlank()||value.trim().length()>max||value.indexOf('\0')>=0)throw err(400,label+"을(를) 확인해 주세요.");return value.trim();}
    @Transactional public Long submit(Long userId,Input input,MultipartFile photo,MultipartFile screenshot){
        if(input==null)throw err(400,"신청 내용을 확인해 주세요.");
        User u=user(userId);String key=text(input.requestKey(),80,"요청 번호");var existing=applications.findByUser_UserIdAndRequestKey(userId,key);if(existing.isPresent())return existing.get().id;
        if(!Boolean.TRUE.equals(input.consent()))throw err(400,"사진과 촬영 위치정보 수집·이용에 동의해 주세요.");
        String name=text(input.name(),100,"시설물 이름"),kind=text(input.kind(),40,"시설 종류"),location=Objects.toString(input.detailLocation(),"").trim();
        if(location.length()>300||location.indexOf('\0')>=0)throw err(400,"상세 위치는 300자 이내로 입력해 주세요.");
        LocalDate date;try{date=LocalDate.parse(input.confirmedDate());}catch(Exception e){throw err(400,"확인 날짜를 선택해 주세요.");}
        if(date.isAfter(LocalDate.now(ZoneId.of("Asia/Seoul"))))throw err(400,"확인 날짜는 오늘 이후일 수 없습니다.");
        if(input.description()!=null&&input.description().length()>3000||input.address()!=null&&input.address().length()>300)throw err(400,"추가 설명 또는 주소가 너무 깁니다.");
        // Validate the original and any legacy screenshot before writing evidence.
        var original=evidence.original(photo);byte[] map=screenshot==null?null:evidence.screenshot(screenshot);
        FacilityApplication a=new FacilityApplication();a.user=u;a.requestKey=key;a.name=name;a.kind=kind;a.address=input.address();a.detailLocation=location;a.confirmedDate=date;a.description=input.description();a.photoLat=original.lat();a.photoLng=original.lng();
        a.consentedAt=Instant.now();applications.save(a);a.photoKey=evidence.save(userId,original.image());if(map!=null)a.screenshotKey=evidence.save(userId,map);return a.id;
    }
    private FacilityApplication own(Long id,Long userId){return applications.findByIdAndUser_UserId(id,userId).orElseThrow(()->err(404,"신청을 찾을 수 없습니다."));}
    private Detail detail(FacilityApplication a){return new Detail(a.id,a.name,a.kind,a.address,a.detailLocation,a.confirmedDate,a.description,a.photoLat,a.photoLng,a.status,a.reviewNote,a.reviewedAt,a.version,a.screenshotKey!=null);}
    public Rows list(Long userId,boolean admin,int page){if(page<0||page>10000)throw err(400,"페이지를 확인해 주세요.");if(admin)reviewer(userId);var request=PageRequest.of(page,20,Sort.by(Sort.Direction.DESC,"createdAt","id"));var rows=admin?applications.findAll(request):applications.findByUser_UserId(userId,request);return new Rows(rows.stream().map(a->new Item(a.id,a.name,a.kind,a.status,a.createdAt)).toList(),page,rows.hasNext());}
    public Detail read(Long userId,Long id,boolean admin){if(admin)reviewer(userId);return detail(admin?applications.findById(id).orElseThrow(()->err(404,"신청을 찾을 수 없습니다.")):own(id,userId));}
    public java.nio.file.Path image(Long userId,Long id,String kind,boolean admin){if(admin)reviewer(userId);FacilityApplication a=admin?applications.findById(id).orElseThrow(()->err(404,"신청을 찾을 수 없습니다.")):own(id,userId);if(!List.of("photo","screenshot").contains(kind))throw err(404,"사진을 찾을 수 없습니다.");return evidence.read(kind.equals("photo")?a.photoKey:a.screenshotKey);}
    @Transactional public Detail review(Long userId,Long id,Review r){
        if(r==null)throw err(400,"처리 내용을 확인해 주세요.");
        reviewer(userId);FacilityApplication a=applications.locked(id).orElseThrow(()->err(404,"신청을 찾을 수 없습니다."));
        if(r.version()==null||r.version()!=a.version||List.of("APPROVED","REJECTED").contains(a.status))throw err(409,"다른 운영자가 처리했거나 신청이 변경되었습니다. 새로고침해 주세요.");
        if(!List.of("REVIEWING","NEEDS_INFO","REJECTED","APPROVED").contains(Objects.toString(r.status(),"")))throw err(400,"처리 상태를 확인해 주세요.");
        if(List.of("NEEDS_INFO","REJECTED").contains(r.status()))text(r.note(),2000,"처리 사유");
        if(r.note()!=null&&r.note().length()>2000)throw err(400,"처리 내용은 2000자 이내로 입력해 주세요.");
        if("APPROVED".equals(r.status())){
            String kind=text(r.categoryName(),40,"등록 카테고리");String key;
            if(List.of("AED","심폐제세동기","자동심장충격기").contains(kind))key="aed";else if("버스정류장".equals(kind))key="bus";else{var c=categories.findByName(kind).orElseGet(()->{var n=new FacilityCategory();n.name=kind;return categories.saveAndFlush(n);});key="facility-"+c.id;}
            if(r.lat()==null||r.lng()==null||!Double.isFinite(r.lat())||!Double.isFinite(r.lng())||Math.abs(r.lat())>90||Math.abs(r.lng())>180)throw err(400,"최종 등록 좌표를 확인해 주세요.");
            RegisteredFacility f=new RegisteredFacility();f.application=a;f.categoryKey=key;f.name=text(r.name(),100,"등록 이름");f.address=text(r.address(),300,"주소");f.lat=r.lat();f.lng=r.lng();f.sido=text(r.sido(),40,"시·도");f.sigungu=text(r.sigungu(),80,"시·군·구");f.adminDong=text(r.adminDong(),40,"행정동");facilities.save(f);
        }
        a.status=r.status();a.reviewNote=r.note();a.reviewer=user(userId);a.reviewedAt=Instant.now();applications.flush();return detail(a);
    }
    public List<Category> categories(){var result=new ArrayList<Category>();result.add(new Category("aed","심폐제세동기","AED","medkit-outline"));result.add(new Category("bus","버스정류장","버스정류장","bus-outline"));categories.findAll(Sort.by("name")).forEach(c->result.add(new Category("facility-"+c.id,c.name,c.name,"location-outline")));return result;}
    public List<PublicDataItem> registered(String key,String sido,String sigungu,String dong){if(sido==null||sigungu==null||dong==null)return List.of();return facilities.findByCategoryKeyAndSidoAndSigunguAndAdminDong(key,sido,sigungu,dong).stream().map(f->new PublicDataItem(-f.id,f.name,f.address,f.lat,f.lng,f.name,f.sido,f.sigungu,f.adminDong)).toList();}
    private static ResponseStatusException err(int code,String reason){return new ResponseStatusException(HttpStatus.valueOf(code),reason);}
}
