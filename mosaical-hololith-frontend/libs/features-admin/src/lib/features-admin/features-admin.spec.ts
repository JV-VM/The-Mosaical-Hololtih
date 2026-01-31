import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FeaturesAdmin } from './features-admin';

describe('FeaturesAdmin', () => {
  let component: FeaturesAdmin;
  let fixture: ComponentFixture<FeaturesAdmin>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [FeaturesAdmin],
    }).compileComponents();

    fixture = TestBed.createComponent(FeaturesAdmin);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
